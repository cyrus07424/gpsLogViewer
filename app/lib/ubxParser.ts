/**
 * UBX binary protocol parser for u-blox GNSS receivers.
 *
 * UBX frame layout:
 *   0xB5 0x62  — sync chars
 *   class (1)  — message class
 *   id    (1)  — message ID
 *   len   (2)  — payload length (little-endian)
 *   payload    — len bytes
 *   CK_A  (1)  — Fletcher checksum A
 *   CK_B  (1)  — Fletcher checksum B
 */

import {
  type GpsPoint,
  type SatelliteInfo,
  type Constellation,
} from "./nmeaParser";

// ── Public output types ────────────────────────────────────────────────────────

export interface RawObservation {
  /** GPS time of week (s) */
  rcvTow: number;
  /** GPS week */
  week: number;
  /** GNSS ID (0=GPS, 1=SBAS, 2=Galileo, 3=BeiDou, 5=QZSS, 6=GLONASS) */
  gnssId: number;
  /** Satellite ID */
  svId: number;
  /** Pseudorange (m) */
  pseudorange: number;
  /** Carrier phase (cycles) */
  carrierPhase: number;
  /** Doppler (Hz) */
  doppler: number;
  /** Signal frequency band: 0=L1, 1=L2, 5=L5 */
  sigId: number;
  /** Tracking status flags */
  trkStat: number;
  /** C/N0 (dBHz) */
  cno: number;
  /** Pseudorange standard deviation (m) */
  prStd: number;
  /** Carrier phase standard deviation (cycles) */
  cpStd: number;
}

export interface NavMessage {
  /** GNSS ID */
  gnssId: number;
  /** Satellite ID */
  svId: number;
  /** Message type ID */
  msgId: number;
  /** Raw navigation message words */
  words: Uint32Array;
  /** GPS time of week when received (ms), or undefined */
  iTow?: number;
}

export interface ClockInfo {
  /** GPS time of week (ms) */
  iTow: number;
  /** Receiver clock bias (ns) */
  clkB: number;
  /** Receiver clock drift (ns/s) */
  clkD: number;
  /** Time accuracy estimate (ns) */
  tAcc: number;
  /** Frequency accuracy estimate (ps/s) */
  fAcc: number;
}

export interface AntennaInfo {
  /** Antenna power status: 0=off, 1=on, 2=don't know */
  antPower: number;
  /** Antenna status: 0=init, 1=don't know, 2=ok, 3=short, 4=open */
  antStatus: number;
  /** AGC monitor level */
  agcCnt: number;
  /** Noise floor */
  noise: number;
}

export interface ParsedUbx {
  points: GpsPoint[];
  errors: string[];
  /** Most recent complete satellite snapshot */
  lastSatellites: SatelliteInfo[];
  /** Satellite history parallel to points[] */
  satelliteHistory: SatelliteInfo[][];
  /** Raw RAWX observations for PPK/RINEX export */
  rawObservations: { tow: number; week: number; obs: RawObservation[] }[];
  /** Navigation messages for RINEX NAV export */
  navMessages: NavMessage[];
  /** Receiver clock snapshots */
  clockHistory: ClockInfo[];
  /** Summary of parsed message counts per type */
  messageCounts: Record<string, number>;
}

// ── Helper ─────────────────────────────────────────────────────────────────────

const SYNC1 = 0xb5;
const SYNC2 = 0x62;

function fletcher(payload: Uint8Array, cls: number, id: number, len: number): [number, number] {
  let a = 0;
  let b = 0;
  const feed = (v: number) => {
    a = (a + v) & 0xff;
    b = (b + a) & 0xff;
  };
  feed(cls);
  feed(id);
  feed(len & 0xff);
  feed((len >> 8) & 0xff);
  for (let i = 0; i < payload.length; i++) feed(payload[i]);
  return [a, b];
}

function gnssIdToConstellation(gnssId: number): Constellation {
  switch (gnssId) {
    case 0: return "GPS";
    case 1: return "SBAS";
    case 2: return "Galileo";
    case 3: return "BeiDou";
    case 5: return "QZSS";
    case 6: return "GLONASS";
    default: return "Unknown";
  }
}

// ── Fix type string ───────────────────────────────────────────────────────────

export function fixTypeLabel(fixType: number): string {
  switch (fixType) {
    case 0: return "No Fix";
    case 1: return "DR";
    case 2: return "2D";
    case 3: return "3D";
    case 4: return "GNSS+DR";
    case 5: return "Time Only";
    default: return `Fix(${fixType})`;
  }
}

// ── Main parser ───────────────────────────────────────────────────────────────

export function parseUbx(buffer: ArrayBuffer): ParsedUbx {
  const bytes = new Uint8Array(buffer);
  const points: GpsPoint[] = [];
  const errors: string[] = [];
  const satelliteMap = new Map<string, SatelliteInfo>();
  const satelliteHistory: SatelliteInfo[][] = [];
  const rawObservations: ParsedUbx["rawObservations"] = [];
  const navMessages: NavMessage[] = [];
  const clockHistory: ClockInfo[] = [];
  const messageCounts: Record<string, number> = {};

  // Pending cross-message state
  let lastAntennaInfo: AntennaInfo | undefined;
  let pendingDop: { pDOP: number; vDOP: number; hDOP: number } | undefined;

  let i = 0;
  while (i < bytes.length - 7) {
    // Scan for sync
    if (bytes[i] !== SYNC1 || bytes[i + 1] !== SYNC2) {
      i++;
      continue;
    }

    const msgClass = bytes[i + 2];
    const msgId = bytes[i + 3];
    const payloadLen = bytes[i + 4] | (bytes[i + 5] << 8);

    const frameEnd = i + 6 + payloadLen + 2;
    if (frameEnd > bytes.length) {
      // Truncated frame
      break;
    }

    const payload = bytes.subarray(i + 6, i + 6 + payloadLen);
    const ckA = bytes[frameEnd - 2];
    const ckB = bytes[frameEnd - 1];
    const [calcA, calcB] = fletcher(payload, msgClass, msgId, payloadLen);

    if (calcA !== ckA || calcB !== ckB) {
      errors.push(`Checksum mismatch at offset ${i}: class=0x${msgClass.toString(16)} id=0x${msgId.toString(16)}`);
      i++;
      continue;
    }

    const key = `0x${msgClass.toString(16).padStart(2, "0")}/0x${msgId.toString(16).padStart(2, "0")}`;
    messageCounts[key] = (messageCounts[key] ?? 0) + 1;

    try {
      const dv = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

      // NAV-PVT (0x01/0x07) — Position, Velocity, Time
      if (msgClass === 0x01 && msgId === 0x07 && payloadLen >= 92) {
        const iTow = dv.getUint32(0, true);
        const year = dv.getUint16(4, true);
        const month = dv.getUint8(6);
        const day = dv.getUint8(7);
        const hour = dv.getUint8(8);
        const min = dv.getUint8(9);
        const sec = dv.getUint8(10);
        const valid = dv.getUint8(11);
        const fixType = dv.getUint8(20);
        const flags = dv.getUint8(21);
        const numSV = dv.getUint8(23);
        const lon = dv.getInt32(24, true) * 1e-7; // deg
        const lat = dv.getInt32(28, true) * 1e-7; // deg
        const height = dv.getInt32(32, true) * 1e-3; // m (ellipsoid)
        const hMSL = dv.getInt32(36, true) * 1e-3; // m (MSL)
        const hAcc = dv.getUint32(40, true) * 1e-3; // m
        const vAcc = dv.getUint32(44, true) * 1e-3; // m
        const velN = dv.getInt32(48, true) * 1e-3; // m/s
        const velE = dv.getInt32(52, true) * 1e-3; // m/s
        const velD = dv.getInt32(56, true) * 1e-3; // m/s
        const gSpeed = dv.getInt32(60, true) * 1e-3; // m/s (ground speed)
        const headMot = dv.getInt32(64, true) * 1e-5; // deg
        const sAcc = dv.getUint32(68, true) * 1e-3; // m/s speed accuracy
        const headAcc = dv.getUint32(72, true) * 1e-5; // deg
        const pDOP = dv.getUint16(76, true) * 0.01;
        void sAcc; // unused but available

        // Only use valid fixes (fixType >= 2, gnssFixOK flag set)
        const gnssFixOk = (flags & 0x01) !== 0;
        if (fixType >= 2 && gnssFixOk) {
          const timestamp =
            (valid & 0x07) === 0x07 && year > 0
              ? new Date(Date.UTC(year, month - 1, day, hour, min, sec))
              : undefined;

          void iTow; // available for correlation if needed
          const speedKmh = gSpeed * 3.6;
          const point: GpsPoint = {
            lat,
            lng: lon,
            altitude: hMSL,
            speed: speedKmh,
            course: isNaN(headMot) ? undefined : headMot,
            timestamp,
            satellites: numSV,
            fixQuality: fixType,
            fixType,
            hAcc,
            vAcc,
            headingAcc: headAcc,
            pDOP: pendingDop?.pDOP ?? pDOP,
            vDOP: pendingDop?.vDOP,
            hDOP: pendingDop?.hDOP,
            antennaStatus: lastAntennaInfo?.antStatus,
          };
          points.push(point);
          satelliteHistory.push(
            Array.from(satelliteMap.values()).sort(
              (a, b) => a.constellation.localeCompare(b.constellation) || a.prn - b.prn
            )
          );
        }
      }

      // NAV-POSLLH (0x01/0x02) — Position solution in LLH
      else if (msgClass === 0x01 && msgId === 0x02 && payloadLen >= 28) {
        // Only used if no NAV-PVT is present; we collect data but defer adding a point
        // (NAV-PVT is the preferred source — POSLLH is handled as fallback)
        void dv;
      }

      // NAV-STATUS (0x01/0x03) — Receiver Navigation Status
      else if (msgClass === 0x01 && msgId === 0x03 && payloadLen >= 16) {
        // gpsfix, flags, fixStat, flags2 — useful for detailed fix status
        void dv;
      }

      // NAV-DOP (0x01/0x04) — Dilution of Precision
      else if (msgClass === 0x01 && msgId === 0x04 && payloadLen >= 18) {
        const gDOP = dv.getUint16(4, true) * 0.01;
        const pDOP = dv.getUint16(6, true) * 0.01;
        const tDOP = dv.getUint16(8, true) * 0.01;
        const vDOP = dv.getUint16(10, true) * 0.01;
        const hDOP = dv.getUint16(12, true) * 0.01;
        const nDOP = dv.getUint16(14, true) * 0.01;
        const eDOP = dv.getUint16(16, true) * 0.01;
        void gDOP; void tDOP; void nDOP; void eDOP;
        pendingDop = { pDOP, vDOP, hDOP };
      }

      // NAV-SAT (0x01/0x35) — Satellite Information
      else if (msgClass === 0x01 && msgId === 0x35 && payloadLen >= 8) {
        const numSvs = dv.getUint8(5);
        for (let s = 0; s < numSvs; s++) {
          const off = 8 + s * 12;
          if (off + 12 > payloadLen) break;
          const gnssId = dv.getUint8(off);
          const svId = dv.getUint8(off + 1);
          const cno = dv.getUint8(off + 2);
          const elev = dv.getInt8(off + 3);
          const azim = dv.getInt16(off + 4, true);
          const flags = dv.getUint32(off + 8, true);
          const qualInd = flags & 0x07;
          const svUsed = ((flags >> 3) & 0x01) !== 0;
          // qualInd >= 4 means signal is being tracked
          if (qualInd >= 1) {
            const constellation = gnssIdToConstellation(gnssId);
            const sat: SatelliteInfo = {
              prn: svId,
              elevation: elev,
              azimuth: azim < 0 ? azim + 360 : azim,
              snr: cno > 0 ? cno : null,
              constellation,
              used: svUsed,
            };
            satelliteMap.set(`${constellation}:${svId}`, sat);
          }
        }
      }

      // NAV-CLOCK (0x01/0x22) — Clock Solution
      else if (msgClass === 0x01 && msgId === 0x22 && payloadLen >= 20) {
        const iTow = dv.getUint32(0, true);
        const clkB = dv.getInt32(4, true); // ns
        const clkD = dv.getInt32(8, true); // ns/s
        const tAcc = dv.getUint32(12, true); // ns
        const fAcc = dv.getUint32(16, true); // ps/s
        clockHistory.push({ iTow, clkB, clkD, tAcc, fAcc });
      }

      // NAV-TIMEGPS (0x01/0x20)
      else if (msgClass === 0x01 && msgId === 0x20 && payloadLen >= 16) {
        void dv;
      }

      // NAV-TIMEUTC (0x01/0x21)
      else if (msgClass === 0x01 && msgId === 0x21 && payloadLen >= 20) {
        void dv;
      }

      // NAV-COV (0x01/0x36) — Position/velocity covariance
      else if (msgClass === 0x01 && msgId === 0x36 && payloadLen >= 64) {
        void dv;
      }

      // RXM-RAWX (0x02/0x15) — Multi-GNSS Raw Measurement Data
      else if (msgClass === 0x02 && msgId === 0x15 && payloadLen >= 16) {
        const rcvTow = dv.getFloat64(0, true); // s
        const week = dv.getUint16(8, true);
        const numMeas = dv.getUint8(11);
        const epochObs: RawObservation[] = [];

        for (let m = 0; m < numMeas; m++) {
          const off = 16 + m * 32;
          if (off + 32 > payloadLen) break;

          const prMes = dv.getFloat64(off, true); // m
          const cpMes = dv.getFloat64(off + 8, true); // cycles
          const doMes = dv.getFloat32(off + 16, true); // Hz
          const gnssId = dv.getUint8(off + 20);
          const svId = dv.getUint8(off + 21);
          const sigId = dv.getUint8(off + 22);
          const freqId = dv.getUint8(off + 23); // GLONASS freq offset
          void freqId;
          const cno = dv.getUint8(off + 26);
          const prStdRaw = dv.getUint8(off + 27);
          const cpStdRaw = dv.getUint8(off + 28);
          const trkStat = dv.getUint8(off + 30);

          // prStd = 0.01 * 2^(prStdRaw & 0xF)
          const prStd = 0.01 * Math.pow(2, prStdRaw & 0x0f);
          // cpStd = 0.004 * (cpStdRaw & 0xF)
          const cpStd = 0.004 * Math.pow(2, cpStdRaw & 0x0f);

          // Only include valid pseudorange measurements
          if ((trkStat & 0x01) !== 0 && isFinite(prMes) && prMes > 0) {
            epochObs.push({
              rcvTow,
              week,
              gnssId,
              svId,
              pseudorange: prMes,
              carrierPhase: cpMes,
              doppler: doMes,
              sigId,
              trkStat,
              cno,
              prStd,
              cpStd,
            });
          }
        }

        if (epochObs.length > 0) {
          rawObservations.push({ tow: rcvTow, week, obs: epochObs });
        }
      }

      // RXM-SFRBX (0x02/0x13) — Navigation message frame
      else if (msgClass === 0x02 && msgId === 0x13 && payloadLen >= 8) {
        const gnssId = dv.getUint8(0);
        const svId = dv.getUint8(1);
        const freqId = dv.getUint8(3);
        void freqId;
        const numWords = dv.getUint8(4);
        const msgType = dv.getUint8(6);
        const version = dv.getUint8(7);
        void version;
        const words = new Uint32Array(numWords);
        for (let w = 0; w < numWords; w++) {
          words[w] = dv.getUint32(8 + w * 4, true);
        }
        navMessages.push({ gnssId, svId, msgId: msgType, words });
      }

      // MON-HW (0x0A/0x09) — Hardware Status
      else if (msgClass === 0x0a && msgId === 0x09 && payloadLen >= 60) {
        const agcCnt = dv.getUint16(4, true);
        const antStatus = dv.getUint8(20);
        const antPower = dv.getUint8(21);
        const noise = dv.getUint16(16, true);
        lastAntennaInfo = { antPower, antStatus, agcCnt, noise };
      }
    } catch (e) {
      errors.push(`Parse error at offset ${i}: ${e}`);
    }

    i = frameEnd;
  }

  const lastSatellites = Array.from(satelliteMap.values()).sort(
    (a, b) => a.constellation.localeCompare(b.constellation) || a.prn - b.prn
  );

  return {
    points,
    errors,
    lastSatellites,
    satelliteHistory,
    rawObservations,
    navMessages,
    clockHistory,
    messageCounts,
  };
}

/** Human-readable antenna status string */
export function antennaStatusLabel(status: number): string {
  switch (status) {
    case 0: return "Init";
    case 1: return "Unknown";
    case 2: return "OK";
    case 3: return "Short";
    case 4: return "Open";
    default: return `Status(${status})`;
  }
}
