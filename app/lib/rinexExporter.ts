/**
 * RINEX 3.04 exporter for PPK processing.
 *
 * Converts UBX RXM-RAWX and RXM-SFRBX data into standard RINEX observation
 * (.obs) and navigation (.nav) files, compatible with RTKLIB, CSRS-PPP, etc.
 */

import type { RawObservation, NavMessage } from "./ubxParser";

// ── Helpers ────────────────────────────────────────────────────────────────────

function padRight(s: string, n: number): string {
  return s.padEnd(n);
}

function padLeft(s: string, n: number): string {
  return s.padStart(n);
}

function formatRinexTime(tow: number, week: number): string {
  // GPS epoch: 6 Jan 1980
  const GPS_EPOCH_MS = 315964800000;
  const ms = GPS_EPOCH_MS + week * 7 * 86400 * 1000 + tow * 1000;
  const d = new Date(ms);
  const yr = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dy = String(d.getUTCDate()).padStart(2, "0");
  const hr = String(d.getUTCHours()).padStart(2, "0");
  const mn = String(d.getUTCMinutes()).padStart(2, "0");
  const sc = (d.getUTCSeconds() + (tow % 1)).toFixed(7).padStart(10, " ");
  return `  ${yr}  ${mo}  ${dy}  ${hr}  ${mn} ${sc}`;
}

/** RINEX 3 satellite system character */
function gnssChar(gnssId: number): string {
  switch (gnssId) {
    case 0: return "G"; // GPS
    case 1: return "S"; // SBAS
    case 2: return "E"; // Galileo
    case 3: return "C"; // BeiDou
    case 5: return "J"; // QZSS
    case 6: return "R"; // GLONASS
    default: return "?";
  }
}

/** RINEX 3 observation code for a given gnssId + sigId */
function obsCode(gnssId: number, sigId: number): { pr: string; cp: string; dp: string; sn: string } {
  // GPS
  if (gnssId === 0) {
    if (sigId === 0) return { pr: "C1C", cp: "L1C", dp: "D1C", sn: "S1C" };
    if (sigId === 3) return { pr: "C2L", cp: "L2L", dp: "D2L", sn: "S2L" };
    if (sigId === 4) return { pr: "C2M", cp: "L2M", dp: "D2M", sn: "S2M" };
    return { pr: "C1C", cp: "L1C", dp: "D1C", sn: "S1C" };
  }
  // GLONASS
  if (gnssId === 6) {
    if (sigId === 0) return { pr: "C1C", cp: "L1C", dp: "D1C", sn: "S1C" };
    if (sigId === 2) return { pr: "C2C", cp: "L2C", dp: "D2C", sn: "S2C" };
    return { pr: "C1C", cp: "L1C", dp: "D1C", sn: "S1C" };
  }
  // Galileo
  if (gnssId === 2) {
    if (sigId === 0) return { pr: "C1C", cp: "L1C", dp: "D1C", sn: "S1C" };
    if (sigId === 1) return { pr: "C1B", cp: "L1B", dp: "D1B", sn: "S1B" };
    if (sigId === 5) return { pr: "C7I", cp: "L7I", dp: "D7I", sn: "S7I" };
    return { pr: "C1C", cp: "L1C", dp: "D1C", sn: "S1C" };
  }
  // BeiDou
  if (gnssId === 3) {
    if (sigId === 0) return { pr: "C2I", cp: "L2I", dp: "D2I", sn: "S2I" };
    if (sigId === 1) return { pr: "C1I", cp: "L1I", dp: "D1I", sn: "S1I" };
    return { pr: "C2I", cp: "L2I", dp: "D2I", sn: "S2I" };
  }
  // QZSS
  if (gnssId === 5) return { pr: "C1C", cp: "L1C", dp: "D1C", sn: "S1C" };
  return { pr: "C1C", cp: "L1C", dp: "D1C", sn: "S1C" };
}

function formatObsValue(v: number | undefined): string {
  if (v === undefined || !isFinite(v)) return "              ";
  // RINEX: 14.3 fixed width
  return v.toFixed(3).padStart(14);
}

// ── OBS file ──────────────────────────────────────────────────────────────────

export function exportRinexObs(
  epochs: { tow: number; week: number; obs: RawObservation[] }[],
  markerName = "UNKNOWN"
): string {
  if (epochs.length === 0) return "";

  // Determine which (gnssId, sigId) pairs are present
  const sigSet = new Set<string>();
  for (const epoch of epochs) {
    for (const o of epoch.obs) {
      sigSet.add(`${o.gnssId}:${o.sigId}`);
    }
  }

  // Group by gnssId
  const gnssIds = Array.from(new Set(epochs.flatMap((e) => e.obs.map((o) => o.gnssId)))).sort();

  const lines: string[] = [];

  // ── Header ──────────────────────────────────────────────────────────────────
  lines.push(padRight("     3.04           OBSERVATION DATA    M (Mixed)       ", 60) + "RINEX VERSION / TYPE");
  lines.push(padRight("gpsLogViewer                                             ", 60) + "PGM / RUN BY / DATE ");
  lines.push(padRight(markerName, 60) + "MARKER NAME         ");
  lines.push(padRight("UNKNOWN             UNKNOWN                              ", 60) + "OBSERVER / AGENCY   ");
  lines.push(padRight("UNKNOWN             UNKNOWN             UNKNOWN          ", 60) + "REC # / TYPE / VERS ");
  lines.push(padRight("UNKNOWN             UNKNOWN                              ", 60) + "ANT # / TYPE        ");
  lines.push(padRight(
    padLeft("0.0000", 14) + padLeft("0.0000", 14) + padLeft("0.0000", 14) + "                  ",
    60
  ) + "APPROX POSITION XYZ ");
  lines.push(padRight(
    padLeft("0.0000", 14) + padLeft("0.0000", 14) + padLeft("0.0000", 14) + "                  ",
    60
  ) + "ANTENNA: DELTA H/E/N");

  // SYS / # / OBS TYPES
  for (const gid of gnssIds) {
    const ch = gnssChar(gid);
    if (ch === "?") continue;
    // Collect unique sigIds for this gnssId
    const sigs = Array.from(
      new Set(epochs.flatMap((e) => e.obs.filter((o) => o.gnssId === gid).map((o) => o.sigId)))
    ).sort();
    const codes: string[] = [];
    for (const sid of sigs) {
      const c = obsCode(gid, sid);
      codes.push(c.pr, c.cp, c.dp, c.sn);
    }
    const uniqueCodes = Array.from(new Set(codes));
    // Max 13 per line, subsequent lines use continuation format
    const first = uniqueCodes.slice(0, 13);
    const rest = uniqueCodes.slice(13);
    lines.push(
      padRight(
        `${ch}  ${String(uniqueCodes.length).padStart(3)}` +
        first.map((c) => ` ${c}`).join(""),
        60
      ) + "SYS / # / OBS TYPES "
    );
    for (let r = 0; r < rest.length; r += 13) {
      const chunk = rest.slice(r, r + 13);
      lines.push(padRight("       " + chunk.map((c) => ` ${c}`).join(""), 60) + "SYS / # / OBS TYPES ");
    }
  }

  // TIME OF FIRST OBS
  if (epochs.length > 0) {
    const t = formatRinexTime(epochs[0].tow, epochs[0].week);
    lines.push(padRight(t + "     GPS            ", 60) + "TIME OF FIRST OBS   ");
  }

  lines.push(padRight("                                                            ", 60) + "END OF HEADER       ");

  // ── Epochs ──────────────────────────────────────────────────────────────────
  for (const epoch of epochs) {
    const timeStr = formatRinexTime(epoch.tow, epoch.week);
    const svCount = epoch.obs.length;
    lines.push(`> ${timeStr}  0${String(svCount).padStart(3)}`);

    // Group obs by (gnssId, svId)
    const svMap = new Map<string, RawObservation[]>();
    for (const o of epoch.obs) {
      const k = `${gnssChar(o.gnssId)}${String(o.svId).padStart(2, "0")}`;
      if (!svMap.has(k)) svMap.set(k, []);
      svMap.get(k)!.push(o);
    }

    for (const [svStr, obs] of svMap) {
      const gid = obs[0].gnssId;
      const sigs = Array.from(new Set(
        epochs.flatMap((e) => e.obs.filter((o) => o.gnssId === gid).map((o) => o.sigId))
      )).sort();
      const uniqueCodes = Array.from(
        new Set(sigs.flatMap((sid) => {
          const c = obsCode(gid, sid);
          return [c.pr, c.cp, c.dp, c.sn];
        }))
      );

      let row = svStr;
      for (const code of uniqueCodes) {
        const obs0 = obs.find((o) => {
          const c = obsCode(o.gnssId, o.sigId);
          return [c.pr, c.cp, c.dp, c.sn].includes(code);
        });
        if (!obs0) {
          row += "              ";
          continue;
        }
        const c = obsCode(obs0.gnssId, obs0.sigId);
        let val: number | undefined;
        if (code === c.pr) val = obs0.pseudorange;
        else if (code === c.cp) val = obs0.carrierPhase;
        else if (code === c.dp) val = obs0.doppler;
        else if (code === c.sn) val = obs0.cno;
        row += formatObsValue(val);
      }
      lines.push(row);
    }
  }

  return lines.join("\n") + "\n";
}

// ── NAV file ──────────────────────────────────────────────────────────────────

/**
 * Export GPS LNAV navigation messages as RINEX 3 NAV.
 * Currently handles GPS L1 C/A subframes 1–3.
 */
export function exportRinexNav(navMessages: NavMessage[]): string {
  const lines: string[] = [];
  lines.push(padRight("     3.04           N: GNSS NAV DATA    M (Mixed)       ", 60) + "RINEX VERSION / TYPE");
  lines.push(padRight("gpsLogViewer                                             ", 60) + "PGM / RUN BY / DATE ");
  lines.push(padRight("                                                            ", 60) + "END OF HEADER       ");

  // Only GPS for now — GPS LNAV is transmitted in 3 subframes × 10 words × 30 bits
  // We collect (svId, subframe) pairs and reconstruct when we have all 3 subframes.
  const sfMap = new Map<string, Map<number, Uint32Array>>();

  for (const msg of navMessages) {
    if (msg.gnssId !== 0) continue; // GPS only
    if (msg.words.length < 10) continue;

    // Subframe ID is bits 20–22 (1-indexed) of word 2 (HOW word)
    const how = msg.words[1];
    const sfId = (how >> 2) & 0x07;
    if (sfId < 1 || sfId > 3) continue;

    const key = `${msg.svId}`;
    if (!sfMap.has(key)) sfMap.set(key, new Map());
    sfMap.get(key)!.set(sfId, msg.words);
  }

  for (const [svStr, subframes] of sfMap) {
    if (!subframes.has(1) || !subframes.has(2) || !subframes.has(3)) continue;
    const svId = parseInt(svStr, 10);

    // Extract ephemeris parameters from GPS LNAV
    // Reference: IS-GPS-200 Table 20-III
    const sf1 = subframes.get(1)!;
    const sf2 = subframes.get(2)!;
    const sf3 = subframes.get(3)!;

    // SF1 — clock & health
    const weekNo = (sf1[2] >> 20) & 0x3ff;
    const ura = (sf1[2] >> 14) & 0x0f;
    const svHealth = (sf1[2] >> 8) & 0x3f;
    void ura; void svHealth;
    const iodc = ((sf1[2] & 0x03) << 8) | ((sf1[7] >> 24) & 0xff);
    void iodc;
    // TGD is bits 0–7 of word 7 of SF1 (signed, scale 2^-31 s)
    const tgdRaw = (sf1[6] >> 0) & 0xff;
    const tgd = signExtend8(tgdRaw) * Math.pow(2, -31);
    // Toc is bits 0–15 of word 8 of SF1 (scale 2^4 s)
    const toc = ((sf1[7] & 0xffff)) * 16;
    const af2 = signExtend8((sf1[8] >> 24) & 0xff) * Math.pow(2, -55);
    const af1 = signExtend16((sf1[8] >> 8) & 0xffff) * Math.pow(2, -43);
    const af0 = signExtend22((sf1[9] >> 10) & 0x3fffff) * Math.pow(2, -31);
    void tgd; void toc; void af2; void af1; void af0;

    // SF2 — orbit set 1
    const iode2 = (sf2[2] >> 24) & 0xff;
    void iode2;
    const crs = signExtend16((sf2[2] >> 8) & 0xffff) * Math.pow(2, -5);
    const deltaN = signExtend16((sf2[3] >> 16) & 0xffff) * Math.pow(2, -43) * Math.PI;
    const m0 = signExtend32((((sf2[3] & 0xff) << 24) | (sf2[4] >> 8))) * Math.pow(2, -31) * Math.PI;
    const cuc = signExtend16((sf2[5] >> 16) & 0xffff) * Math.pow(2, -29);
    const e = ((((sf2[5] & 0xff) << 24) | (sf2[6] >> 8)) >>> 0) * Math.pow(2, -33);
    const cus = signExtend16((sf2[7] >> 16) & 0xffff) * Math.pow(2, -29);
    const sqrtA = ((((sf2[7] & 0xff) << 24) | (sf2[8] >> 8)) >>> 0) * Math.pow(2, -19);
    const toe = ((sf2[9] >> 16) & 0xffff) * 16;
    void crs; void deltaN; void m0; void cuc; void e; void cus; void sqrtA; void toe;

    // SF3 — orbit set 2
    const cic = signExtend16((sf3[2] >> 16) & 0xffff) * Math.pow(2, -29);
    const omega0 = signExtend32((((sf3[2] & 0xff) << 24) | (sf3[3] >> 8))) * Math.pow(2, -31) * Math.PI;
    const cis = signExtend16((sf3[4] >> 16) & 0xffff) * Math.pow(2, -29);
    const i0 = signExtend32((((sf3[4] & 0xff) << 24) | (sf3[5] >> 8))) * Math.pow(2, -31) * Math.PI;
    const crc = signExtend16((sf3[6] >> 16) & 0xffff) * Math.pow(2, -5);
    const omega = signExtend32((((sf3[6] & 0xff) << 24) | (sf3[7] >> 8))) * Math.pow(2, -31) * Math.PI;
    const omegaDot = signExtend24((sf3[8] >> 8) & 0xffffff) * Math.pow(2, -43) * Math.PI;
    const iode3 = (sf3[9] >> 24) & 0xff;
    const iDot = signExtend14((sf3[9] >> 10) & 0x3fff) * Math.pow(2, -43) * Math.PI;
    void cic; void omega0; void cis; void i0; void crc; void omega; void omegaDot; void iode3; void iDot;

    // Build a minimal RINEX NAV record (many fields set to 0 for brevity)
    const svStr2 = `G${String(svId).padStart(2, "0")}`;
    // Use GPS week + toc for epoch — rough approximate date
    const GPS_EPOCH_MS = 315964800000;
    const tocMs = GPS_EPOCH_MS + weekNo * 7 * 86400 * 1000 + toc * 1000;
    const dt = new Date(tocMs);
    const ep = ` ${dt.getUTCFullYear()} ${String(dt.getUTCMonth() + 1).padStart(2)} ${String(dt.getUTCDate()).padStart(2)} ${String(dt.getUTCHours()).padStart(2)} ${String(dt.getUTCMinutes()).padStart(2)} ${String(dt.getUTCSeconds()).padStart(2)}`;
    lines.push(`${svStr2}${ep}${fmtN(af0)}${fmtN(af1)}${fmtN(af2)}`);
    lines.push(`    ${fmtN(iode2)}${fmtN(crs)}${fmtN(deltaN)}${fmtN(m0)}`);
    lines.push(`    ${fmtN(cuc)}${fmtN(e)}${fmtN(cus)}${fmtN(sqrtA)}`);
    lines.push(`    ${fmtN(toe)}${fmtN(cic)}${fmtN(omega0)}${fmtN(cis)}`);
    lines.push(`    ${fmtN(i0)}${fmtN(crc)}${fmtN(omega)}${fmtN(omegaDot)}`);
    lines.push(`    ${fmtN(iDot)}${fmtN(0)}${fmtN(weekNo)}${fmtN(0)}`);
    lines.push(`    ${fmtN(ura)}${fmtN(svHealth)}${fmtN(tgd)}${fmtN(iodc)}`);
    lines.push(`    ${fmtN(toc)}${fmtN(0)}${fmtN(0)}${fmtN(0)}`);
  }

  return lines.join("\n") + "\n";
}

// ── Signed integer helpers ─────────────────────────────────────────────────────

function signExtend8(v: number): number {
  return (v & 0x80) ? v - 256 : v;
}
function signExtend14(v: number): number {
  return (v & 0x2000) ? v - 0x4000 : v;
}
function signExtend16(v: number): number {
  return (v & 0x8000) ? v - 0x10000 : v;
}
function signExtend22(v: number): number {
  return (v & 0x200000) ? v - 0x400000 : v;
}
function signExtend24(v: number): number {
  return (v & 0x800000) ? v - 0x1000000 : v;
}
function signExtend32(v: number): number {
  return v | 0; // coerce to signed 32-bit
}

/** Format a floating-point number in RINEX 19.12D notation */
function fmtN(v: number): string {
  if (!isFinite(v)) return "   0.000000000000D+00";
  const s = v.toExponential(12).replace(/e([+-]?\d+)/, "D$1");
  // Ensure exponent is 2 digits with sign
  return s.replace(/D([+-])(\d)$/, "D$1+0$2").replace(/D\+(\d{2})$/, "D+$1").padStart(19);
}

// ── Download helpers ──────────────────────────────────────────────────────────

/** Trigger browser download of a text blob */
function downloadText(content: string, filename: string): void {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadRinexObs(
  epochs: { tow: number; week: number; obs: RawObservation[] }[],
  baseName: string
): void {
  const content = exportRinexObs(epochs, baseName);
  downloadText(content, `${baseName}.obs`);
}

export function downloadRinexNav(navMessages: NavMessage[], baseName: string): void {
  const content = exportRinexNav(navMessages);
  downloadText(content, `${baseName}.nav`);
}
