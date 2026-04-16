import type { GpsPoint } from "./nmeaParser";

/**
 * Convert an array of GpsPoint to a GPX XML string and trigger a browser download.
 */
export function exportToGpx(points: GpsPoint[], filename: string): void {
  const gpxContent = buildGpx(points, filename);
  const blob = new Blob([gpxContent], { type: "application/gpx+xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function buildGpx(points: GpsPoint[], trackName: string = "Track"): string {
  const trkpts = points
    .map((p) => {
      const parts: string[] = [];
      if (p.altitude !== undefined) {
        parts.push(`      <ele>${p.altitude.toFixed(3)}</ele>`);
      }
      if (p.timestamp) {
        parts.push(`      <time>${p.timestamp.toISOString()}</time>`);
      }
      if (p.speed !== undefined) {
        // GPX extension: speed in m/s
        parts.push(`      <speed>${(p.speed / 3.6).toFixed(4)}</speed>`);
      }
      if (p.course !== undefined) {
        parts.push(`      <course>${p.course.toFixed(2)}</course>`);
      }
      if (p.hdop !== undefined) {
        parts.push(`      <hdop>${p.hdop.toFixed(2)}</hdop>`);
      }
      if (p.satellites !== undefined) {
        parts.push(`      <sat>${p.satellites}</sat>`);
      }
      if (p.fixQuality !== undefined) {
        parts.push(`      <fix>${p.fixQuality >= 2 ? "3d" : "2d"}</fix>`);
      }
      const children = parts.length > 0 ? `\n${parts.join("\n")}\n    ` : "";
      return `    <trkpt lat="${p.lat.toFixed(8)}" lon="${p.lng.toFixed(8)}">${children}</trkpt>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1"
  creator="GPS Log Viewer"
  xmlns="http://www.topografix.com/GPX/1/1"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <trk>
    <name>${escapeXml(trackName)}</name>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>`;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
