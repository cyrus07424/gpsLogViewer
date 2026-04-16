export interface GpsPoint {
  lat: number;
  lng: number;
  altitude?: number; // meters
  speed?: number; // km/h
  course?: number; // degrees
  timestamp?: Date;
  hdop?: number;
  pdop?: number;
  vdop?: number;
  satellites?: number;
  fixQuality?: number;
}

export type Constellation =
  | "GPS"
  | "GLONASS"
  | "Galileo"
  | "BeiDou"
  | "QZSS"
  | "SBAS"
  | "Unknown";

export interface SatelliteInfo {
  /** Satellite PRN / ID number */
  prn: number;
  /** Elevation above horizon in degrees (0–90) */
  elevation: number;
  /** Azimuth from true north in degrees clockwise (0–360) */
  azimuth: number;
  /** Signal-to-noise ratio in dBHz, or null when not currently tracked */
  snr: number | null;
  constellation: Constellation;
  /** Whether this satellite is used in the current position fix */
  used: boolean;
}

export interface ParsedNmea {
  points: GpsPoint[];
  rawSentences: string[];
  errors: string[];
  /** Most recent complete set of visible satellites, keyed as they appeared in the last GSV group. */
  lastSatellites: SatelliteInfo[];
}

function parseLatLng(
  value: string,
  dir: string,
  isLat: boolean
): number | null {
  if (!value || !dir) return null;
  const degrees = isLat
    ? parseInt(value.substring(0, 2), 10)
    : parseInt(value.substring(0, 3), 10);
  const minutes = parseFloat(isLat ? value.substring(2) : value.substring(3));
  if (isNaN(degrees) || isNaN(minutes)) return null;
  let decimal = degrees + minutes / 60;
  if (dir === "S" || dir === "W") decimal = -decimal;
  return decimal;
}

function parseTime(timeStr: string, dateStr?: string): Date | undefined {
  if (!timeStr || timeStr.length < 6) return undefined;
  const hours = parseInt(timeStr.substring(0, 2), 10);
  const minutes = parseInt(timeStr.substring(2, 4), 10);
  const seconds = parseFloat(timeStr.substring(4));
  if (isNaN(hours) || isNaN(minutes) || isNaN(seconds)) return undefined;

  let year = 2000,
    month = 0,
    day = 1;
  if (dateStr && dateStr.length === 6) {
    day = parseInt(dateStr.substring(0, 2), 10);
    month = parseInt(dateStr.substring(2, 4), 10) - 1;
    year = 2000 + parseInt(dateStr.substring(4, 6), 10);
  }
  return new Date(
    Date.UTC(year, month, day, hours, minutes, Math.floor(seconds))
  );
}

function verifyChecksum(sentence: string): boolean {
  const asterisk = sentence.indexOf("*");
  if (asterisk < 0) return true; // no checksum to verify
  const data = sentence.substring(1, asterisk);
  const expected = parseInt(sentence.substring(asterisk + 1, asterisk + 3), 16);
  let calc = 0;
  for (let i = 0; i < data.length; i++) {
    calc ^= data.charCodeAt(i);
  }
  return calc === expected;
}

interface GgaEntry {
  altitude: number;
  fixQuality: number;
  hdop: number;
  satellites: number;
}

/** Map talker-ID prefix (e.g. "GP", "GL") to a Constellation label. */
function talkerToConstellation(talker: string): Constellation {
  switch (talker) {
    case "GP": return "GPS";
    case "GL": return "GLONASS";
    case "GA": return "Galileo";
    case "GB":
    case "BD": return "BeiDou";
    case "GQ": return "QZSS";
    case "GS": return "SBAS";
    default:   return "Unknown";
  }
}

/**
 * When a multi-constellation talker ("GN") is used we attempt to infer the
 * constellation from well-known PRN / SVID ranges.  Returns "Unknown" when the
 * range cannot be determined.
 */
function prnToConstellation(prn: number): Constellation {
  if (prn >= 1   && prn <= 32)  return "GPS";
  if (prn >= 33  && prn <= 64)  return "SBAS";
  if (prn >= 65  && prn <= 96)  return "GLONASS";
  if (prn >= 120 && prn <= 158) return "SBAS";
  // Check BeiDou before QZSS so that the overlapping range 201–202 is
  // correctly identified as BeiDou (the QZSS constellation only uses
  // five practical SVIDs in the 193–197 range).
  if (prn >= 201 && prn <= 235) return "BeiDou";
  if (prn >= 193 && prn <= 202) return "QZSS";
  if (prn >= 301 && prn <= 336) return "Galileo";
  return "Unknown";
}

// Normalize a NMEA time field to HHMMSS (drop fractional seconds) for use as
// a map key, so that GGA and RMC sentences from the same fix always match even
// when their fractional-second precision differs.
function normalizeTimeKey(timeStr: string): string {
  if (!timeStr) return "";
  // Time fields are HHMMSS[.sss] – keep only the first 6 characters.
  return timeStr.substring(0, 6);
}

export function parseNmea(content: string): ParsedNmea {
  // Split on all common line-ending conventions: \r\n, \r (bare CR used by
  // many GPS devices), and \n (Unix).
  const lines = content.split(/\r\n|\r|\n/);
  const points: GpsPoint[] = [];
  const rawSentences: string[] = [];
  const errors: string[] = [];

  // Temporary storage to correlate GGA altitude/quality with RMC speed.
  // Keyed by normalised time (HHMMSS) so precision differences don't break matching.
  const pendingGga: Map<string, GgaEntry> = new Map();

  // Most-recently parsed valid GGA entry.  Used as a fallback when the time-key
  // lookup fails (e.g. device outputs RMC before GGA in the same fix cycle, or
  // the time key is absent).
  let lastGga: GgaEntry | undefined;

  // ── Satellite tracking ────────────────────────────────────────────────────
  // Running satellite map: key = `${constellation}:${prn}` → SatelliteInfo.
  // Updated continuously as new GSV sentences arrive.
  const satelliteMap = new Map<string, SatelliteInfo>();

  // Set of PRNs that appear in GSA sentences (used-in-fix).
  // Reset each time a new GSA sentence is processed.
  const usedPrns = new Set<number>();

  // GSV sentence-group accumulator.
  // Key = talker (e.g. "GP"), Value = { totalSentences, collected satellites[] }
  const gsvBuffer = new Map<string, { total: number; sats: SatelliteInfo[] }>();

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || !line.startsWith("$")) continue;
    rawSentences.push(line);

    if (!verifyChecksum(line)) {
      errors.push(`Checksum mismatch: ${line}`);
      continue;
    }

    const asterisk = line.indexOf("*");
    const sentence = asterisk >= 0 ? line.substring(0, asterisk) : line;
    const parts = sentence.split(",");
    const type = parts[0];

    try {
      if (type === "$GPGGA" || type === "$GNGGA" || type === "$GLGGA") {
        // $GPGGA,time,lat,N/S,lng,E/W,fixQ,numSV,HDOP,alt,M,...
        const timeStr = parts[1];
        const lat = parseLatLng(parts[2], parts[3], true);
        const lng = parseLatLng(parts[4], parts[5], false);
        if (lat !== null && lng !== null) {
          const fixQuality = parseInt(parts[6], 10);
          if (fixQuality > 0) {
            const satellites = parseInt(parts[7], 10);
            const hdop = parseFloat(parts[8]);
            const altitude = parseFloat(parts[9]);
            const key = normalizeTimeKey(timeStr) || `${lat},${lng}`;
            const entry: GgaEntry = {
              altitude: isNaN(altitude) ? 0 : altitude,
              fixQuality,
              hdop: isNaN(hdop) ? 99 : hdop,
              satellites: isNaN(satellites) ? 0 : satellites,
            };
            pendingGga.set(key, entry);
            lastGga = entry;
          }
        }
      } else if (type === "$GPRMC" || type === "$GNRMC" || type === "$GLRMC") {
        // $GPRMC,time,A/V,lat,N/S,lng,E/W,speed(knots),course,date,...
        const timeStr = parts[1];
        const status = parts[2];
        if (status !== "A") continue; // only active fixes

        const lat = parseLatLng(parts[3], parts[4], true);
        const lng = parseLatLng(parts[5], parts[6], false);
        if (lat === null || lng === null) continue;

        const speedKnots = parseFloat(parts[7]);
        const course = parseFloat(parts[8]);
        const dateStr = parts[9];
        const timestamp = parseTime(timeStr, dateStr);

        const speedKmh = isNaN(speedKnots) ? undefined : speedKnots * 1.852;
        // Try exact (normalised) time key first; fall back to lastGga so that
        // altitude/satellites are preserved even when GGA follows RMC in the
        // fix cycle or when the time keys differ in fractional-second precision.
        const gga = pendingGga.get(normalizeTimeKey(timeStr) || `${lat},${lng}`) ?? lastGga;

        const point: GpsPoint = {
          lat,
          lng,
          speed: speedKmh,
          course: isNaN(course) ? undefined : course,
          timestamp,
          altitude: gga?.altitude,
          fixQuality: gga?.fixQuality,
          hdop: gga?.hdop,
          satellites: gga?.satellites,
        };
        points.push(point);
      } else if (type.length >= 6 && type.endsWith("GSA")) {
        // $GPGSA,A,fixType,prn1,..,prn12,PDOP,HDOP,VDOP
        // parts[3..14] are satellite PRNs used in the fix (may be empty).
        usedPrns.clear();
        for (let i = 3; i <= 14 && i < parts.length; i++) {
          const prn = parseInt(parts[i], 10);
          if (!isNaN(prn) && prn > 0) usedPrns.add(prn);
        }
        // Update "used" flag on any satellites we already know about.
        for (const sat of satelliteMap.values()) {
          sat.used = usedPrns.has(sat.prn);
        }
      } else if (type.length >= 6 && type.endsWith("GSV")) {
        // $GPGSV,totalSentences,sentenceNum,totalSats,prn1,elev1,az1,snr1,...
        const totalSentences = parseInt(parts[1], 10);
        const sentenceNum   = parseInt(parts[2], 10);
        if (isNaN(totalSentences) || isNaN(sentenceNum)) continue;

        // Determine constellation from the talker-ID prefix (chars 1-2).
        const talker = type.substring(1, 3); // e.g. "GP", "GL", "GN"
        const baseConstellation = talkerToConstellation(talker);

        if (!gsvBuffer.has(talker) || sentenceNum === 1) {
          // Start (or restart) a new group for this talker.
          gsvBuffer.set(talker, { total: totalSentences, sats: [] });
        }

        const group = gsvBuffer.get(talker)!;

        // Parse up to 4 satellite blocks: offset 4, 8, 12, 16
        for (let offset = 4; offset + 2 < parts.length; offset += 4) {
          const prn = parseInt(parts[offset], 10);
          if (isNaN(prn) || prn <= 0) continue;

          const elevation = parseInt(parts[offset + 1], 10);
          const azimuth   = parseInt(parts[offset + 2], 10);
          // SNR field may carry the checksum (*XX) when it's the last field.
          const snrRaw = (parts[offset + 3] ?? "").split("*")[0];
          const snr = snrRaw === "" ? null : parseFloat(snrRaw);

          const constellation =
            baseConstellation === "Unknown"
              ? prnToConstellation(prn)
              : baseConstellation;

          group.sats.push({
            prn,
            elevation: isNaN(elevation) ? 0 : elevation,
            azimuth:   isNaN(azimuth) ? 0 : azimuth,
            snr:       snr === null || isNaN(snr) ? null : snr,
            constellation,
            used: usedPrns.has(prn),
          });
        }

        // When the final sentence of the group arrives, flush into satelliteMap.
        if (sentenceNum === totalSentences) {
          for (const sat of group.sats) {
            satelliteMap.set(`${sat.constellation}:${sat.prn}`, sat);
          }
          gsvBuffer.delete(talker);
        }
      }
    } catch (e) {
      errors.push(`Parse error on: ${line} — ${e}`);
    }
  }

  // If we only have GGA data (no RMC), fall back to GGA-only points
  if (points.length === 0 && pendingGga.size > 0) {
    // Second pass for GGA-only files
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || !line.startsWith("$")) continue;
      const asterisk = line.indexOf("*");
      const sentence = asterisk >= 0 ? line.substring(0, asterisk) : line;
      const parts = sentence.split(",");
      const type = parts[0];
      if (type === "$GPGGA" || type === "$GNGGA" || type === "$GLGGA") {
        const timeStr = parts[1];
        const lat = parseLatLng(parts[2], parts[3], true);
        const lng = parseLatLng(parts[4], parts[5], false);
        if (lat !== null && lng !== null) {
          const fixQuality = parseInt(parts[6], 10);
          if (fixQuality > 0) {
            const satellites = parseInt(parts[7], 10);
            const hdop = parseFloat(parts[8]);
            const altitude = parseFloat(parts[9]);
            const timestamp = parseTime(timeStr);
            points.push({
              lat,
              lng,
              altitude: isNaN(altitude) ? undefined : altitude,
              fixQuality,
              hdop: isNaN(hdop) ? undefined : hdop,
              satellites: isNaN(satellites) ? undefined : satellites,
              timestamp,
            });
          }
        }
      }
    }
  }

  // Build final satellite list from the running map.
  const lastSatellites = Array.from(satelliteMap.values()).sort(
    (a, b) => a.constellation.localeCompare(b.constellation) || a.prn - b.prn
  );

  return { points, rawSentences, errors, lastSatellites };
}

export interface TrackStats {
  totalDistanceKm: number;
  durationSeconds: number;
  maxSpeedKmh: number;
  avgSpeedKmh: number;
  maxAltitude: number;
  minAltitude: number;
  startTime?: Date;
  endTime?: Date;
  pointCount: number;
  /** Mean latitude of all fix points (degrees). */
  meanLat?: number;
  /** Mean longitude of all fix points (degrees). */
  meanLng?: number;
  /**
   * Circular Error Probable (50 %) in metres.
   * Median radial distance from the mean position.
   */
  cep50?: number;
  /**
   * 2D root-mean-square × 2 in metres.
   * 2drms = 2 × √(σ²_E + σ²_N)
   */
  drms2?: number;
}

// Haversine distance in km between two lat/lng points
function haversine(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * For any point that lacks a speed value, compute it from the haversine distance
 * and time difference with the previous point.  Points that already have a speed
 * are left unchanged.  Requires at least two consecutive points with timestamps.
 */
export function fillMissingSpeed(points: GpsPoint[]): GpsPoint[] {
  if (points.length < 2) return points;

  return points.map((p, i) => {
    if (p.speed !== undefined) return p; // already has speed – keep it
    if (i === 0) return p; // no previous point to diff against

    const prev = points[i - 1];
    if (!prev.timestamp || !p.timestamp) return p; // no time info

    const dtSeconds = (p.timestamp.getTime() - prev.timestamp.getTime()) / 1000;
    if (dtSeconds <= 0) return p; // avoid division by zero or negative intervals

    const distKm = haversine(prev.lat, prev.lng, p.lat, p.lng);
    const speedKmh = (distKm / dtSeconds) * 3600;

    return { ...p, speed: speedKmh };
  });
}

export function computeStats(points: GpsPoint[]): TrackStats {
  if (points.length === 0) {
    return {
      totalDistanceKm: 0,
      durationSeconds: 0,
      maxSpeedKmh: 0,
      avgSpeedKmh: 0,
      maxAltitude: 0,
      minAltitude: 0,
      pointCount: 0,
    };
  }

  let totalDistanceKm = 0;
  let maxSpeedKmh = 0;
  const altitudes: number[] = [];
  const speeds: number[] = [];

  for (let i = 1; i < points.length; i++) {
    totalDistanceKm += haversine(
      points[i - 1].lat,
      points[i - 1].lng,
      points[i].lat,
      points[i].lng
    );
  }

  for (const p of points) {
    if (p.speed !== undefined) {
      speeds.push(p.speed);
      if (p.speed > maxSpeedKmh) maxSpeedKmh = p.speed;
    }
    if (p.altitude !== undefined) {
      altitudes.push(p.altitude);
    }
  }

  const avgSpeedKmh =
    speeds.length > 0 ? speeds.reduce((a, b) => a + b, 0) / speeds.length : 0;

  const startTime = points[0].timestamp;
  const endTime = points[points.length - 1].timestamp;
  const durationSeconds =
    startTime && endTime
      ? (endTime.getTime() - startTime.getTime()) / 1000
      : 0;

  // ── Position accuracy statistics (CEP 50%, 2drms) ───────────────────────
  const meanLat = points.reduce((s, p) => s + p.lat, 0) / points.length;
  const meanLng = points.reduce((s, p) => s + p.lng, 0) / points.length;
  const R = 6371000; // Earth radius in metres
  const cosLat = Math.cos((meanLat * Math.PI) / 180);

  // East and North offsets in metres for each point.
  const eOffsets = points.map(
    (p) => R * cosLat * ((p.lng - meanLng) * Math.PI) / 180
  );
  const nOffsets = points.map(
    (p) => R * ((p.lat - meanLat) * Math.PI) / 180
  );
  const radii = points.map((_, i) =>
    Math.sqrt(eOffsets[i] ** 2 + nOffsets[i] ** 2)
  );

  // CEP 50%: median radial distance.
  const sortedRadii = [...radii].sort((a, b) => a - b);
  const cep50 =
    sortedRadii.length % 2 === 0
      ? (sortedRadii[sortedRadii.length / 2 - 1] + sortedRadii[sortedRadii.length / 2]) / 2
      : sortedRadii[Math.floor(sortedRadii.length / 2)];

  // 2drms = 2 × √(σ²_E + σ²_N)
  const meanE = eOffsets.reduce((s, v) => s + v, 0) / eOffsets.length;
  const meanN = nOffsets.reduce((s, v) => s + v, 0) / nOffsets.length;
  const varE = eOffsets.reduce((s, v) => s + (v - meanE) ** 2, 0) / eOffsets.length;
  const varN = nOffsets.reduce((s, v) => s + (v - meanN) ** 2, 0) / nOffsets.length;
  const drms2 = 2 * Math.sqrt(varE + varN);

  return {
    totalDistanceKm,
    durationSeconds,
    maxSpeedKmh,
    avgSpeedKmh,
    maxAltitude: altitudes.length > 0 ? Math.max(...altitudes) : 0,
    minAltitude: altitudes.length > 0 ? Math.min(...altitudes) : 0,
    startTime,
    endTime,
    pointCount: points.length,
    meanLat,
    meanLng,
    cep50,
    drms2,
  };
}
