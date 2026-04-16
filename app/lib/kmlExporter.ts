import type { GpsPoint } from "./nmeaParser";

/**
 * Convert an array of GpsPoint to a KML XML string and trigger a browser download.
 */
export function exportToKml(points: GpsPoint[], filename: string): void {
  const kmlContent = buildKml(points, filename.replace(/\.[^.]+$/, ""));
  const blob = new Blob([kmlContent], { type: "application/vnd.google-earth.kml+xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

export function buildKml(points: GpsPoint[], trackName: string = "Track"): string {
  const hasTimestamps = points.some((p) => p.timestamp !== undefined);

  let coordinatesBlock: string;
  if (hasTimestamps) {
    // Use gx:Track for timestamped data
    const whenLines = points.map((p) =>
      p.timestamp ? `      <when>${p.timestamp.toISOString()}</when>` : "      <when></when>"
    );
    const coordLines = points.map((p) => {
      const alt = p.altitude !== undefined ? ` ${p.altitude.toFixed(3)}` : " 0";
      return `      <gx:coord>${p.lng.toFixed(8)} ${p.lat.toFixed(8)}${alt}</gx:coord>`;
    });
    coordinatesBlock = `    <Placemark>
      <name>${escapeXml(trackName)}</name>
      <gx:Track>
${whenLines.join("\n")}
${coordLines.join("\n")}
      </gx:Track>
    </Placemark>`;
  } else {
    // Use LineString for plain coordinate data
    const coords = points
      .map((p) => {
        const alt = p.altitude !== undefined ? `,${p.altitude.toFixed(3)}` : "";
        return `        ${p.lng.toFixed(8)},${p.lat.toFixed(8)}${alt}`;
      })
      .join("\n");
    coordinatesBlock = `    <Placemark>
      <name>${escapeXml(trackName)}</name>
      <LineString>
        <tessellate>1</tessellate>
        <coordinates>
${coords}
        </coordinates>
      </LineString>
    </Placemark>`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"
  xmlns:gx="http://www.google.com/kml/ext/2.2">
  <Document>
    <name>${escapeXml(trackName)}</name>
${coordinatesBlock}
  </Document>
</kml>`;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
