import JSZip from "jszip";
import type { GpsPoint } from "./nmeaParser";

export interface ParsedKml {
  points: GpsPoint[];
  errors: string[];
}

export function parseKml(content: string): ParsedKml {
  const errors: string[] = [];
  const points: GpsPoint[] = [];

  let doc: Document;
  try {
    const parser = new DOMParser();
    doc = parser.parseFromString(content, "application/xml");
    const parseError = doc.querySelector("parsererror");
    if (parseError) {
      errors.push(`KML XMLの解析に失敗しました: ${parseError.textContent?.trim()}`);
      return { points, errors };
    }
  } catch (e) {
    errors.push(`KML XMLの解析に失敗しました: ${e}`);
    return { points, errors };
  }

  // KML stores coordinates in <coordinates> element as "lon,lat[,alt] lon,lat[,alt] ..."
  // Try LineString/MultiGeometry coordinates first (track-like)
  const coordinateEls = Array.from(doc.querySelectorAll("coordinates"));

  for (const el of coordinateEls) {
    const raw = el.textContent?.trim() ?? "";
    const tuples = raw.split(/\s+/).filter(Boolean);
    for (const tuple of tuples) {
      const parts = tuple.split(",");
      const lng = parseFloat(parts[0]);
      const lat = parseFloat(parts[1]);
      const altitude = parts[2] ? parseFloat(parts[2]) : undefined;
      if (isNaN(lat) || isNaN(lng)) continue;
      points.push({
        lat,
        lng,
        altitude: altitude !== undefined && !isNaN(altitude) ? altitude : undefined,
      });
    }
  }

  // Try to extract timestamps from <when> elements (KML gx:Track extension)
  // gx:Track pairs <when> with <gx:coord> elements
  const whenEls = Array.from(doc.querySelectorAll("when"));
  const coordEls = Array.from(doc.querySelectorAll("coord"));

  if (whenEls.length > 0 && coordEls.length === whenEls.length) {
    // Replace points parsed above from coordinates, use gx:Track instead
    points.length = 0;
    for (let i = 0; i < coordEls.length; i++) {
      const raw = coordEls[i].textContent?.trim() ?? "";
      const parts = raw.split(/\s+/);
      const lng = parseFloat(parts[0]);
      const lat = parseFloat(parts[1]);
      const altitude = parts[2] ? parseFloat(parts[2]) : undefined;
      const timestamp = whenEls[i]
        ? new Date(whenEls[i].textContent?.trim() ?? "")
        : undefined;
      if (isNaN(lat) || isNaN(lng)) continue;
      points.push({
        lat,
        lng,
        altitude: altitude !== undefined && !isNaN(altitude) ? altitude : undefined,
        timestamp: timestamp && !isNaN(timestamp.getTime()) ? timestamp : undefined,
      });
    }
  }

  return { points, errors };
}

/**
 * Parse a KMZ (zipped KML) file from an ArrayBuffer.
 * Extracts the first .kml entry in the ZIP archive and parses it.
 */
export async function parseKmz(buffer: ArrayBuffer): Promise<ParsedKml> {
  const errors: string[] = [];
  try {
    const zip = await JSZip.loadAsync(buffer);
    // Find the first .kml file (doc.kml is the conventional name)
    const kmlFile =
      zip.file("doc.kml") ??
      Object.values(zip.files).find((f) => !f.dir && f.name.toLowerCase().endsWith(".kml"));
    if (!kmlFile) {
      return { points: [], errors: ["KMZファイル内にKMLファイルが見つかりませんでした。"] };
    }
    const kmlContent = await kmlFile.async("string");
    return parseKml(kmlContent);
  } catch (e) {
    errors.push(`KMZファイルの解析に失敗しました: ${e}`);
    return { points: [], errors };
  }
}
