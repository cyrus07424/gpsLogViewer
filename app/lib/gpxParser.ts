import type { GpsPoint } from "./nmeaParser";

export interface ParsedGpx {
  points: GpsPoint[];
  errors: string[];
}

export function parseGpx(content: string): ParsedGpx {
  const errors: string[] = [];
  const points: GpsPoint[] = [];

  let doc: Document;
  try {
    const parser = new DOMParser();
    doc = parser.parseFromString(content, "application/xml");
    const parseError = doc.querySelector("parsererror");
    if (parseError) {
      errors.push(`GPX XMLの解析に失敗しました: ${parseError.textContent?.trim()}`);
      return { points, errors };
    }
  } catch (e) {
    errors.push(`GPX XMLの解析に失敗しました: ${e}`);
    return { points, errors };
  }

  // Collect trkpt (track points), rtept (route points), wpt (waypoints)
  const elements = Array.from(
    doc.querySelectorAll("trkpt, rtept, wpt")
  );

  for (const el of elements) {
    try {
      const lat = parseFloat(el.getAttribute("lat") ?? "");
      const lng = parseFloat(el.getAttribute("lon") ?? "");
      if (isNaN(lat) || isNaN(lng)) continue;

      const eleEl = el.querySelector("ele");
      const timeEl = el.querySelector("time");
      const hdopEl = el.querySelector("hdop");
      const satEl = el.querySelector("sat");
      const speedEl = el.querySelector("speed");
      const courseEl = el.querySelector("course");

      const altitude = eleEl ? parseFloat(eleEl.textContent ?? "") : undefined;
      const timestamp = timeEl ? new Date(timeEl.textContent?.trim() ?? "") : undefined;
      const hdop = hdopEl ? parseFloat(hdopEl.textContent ?? "") : undefined;
      const satellites = satEl ? parseInt(satEl.textContent ?? "", 10) : undefined;
      // GPX speed is m/s → km/h
      const speedMs = speedEl ? parseFloat(speedEl.textContent ?? "") : undefined;
      const speed = speedMs !== undefined && !isNaN(speedMs) ? speedMs * 3.6 : undefined;
      const course = courseEl ? parseFloat(courseEl.textContent ?? "") : undefined;

      points.push({
        lat,
        lng,
        altitude: altitude !== undefined && !isNaN(altitude) ? altitude : undefined,
        timestamp: timestamp && !isNaN(timestamp.getTime()) ? timestamp : undefined,
        hdop: hdop !== undefined && !isNaN(hdop) ? hdop : undefined,
        satellites: satellites !== undefined && !isNaN(satellites) ? satellites : undefined,
        speed,
        course: course !== undefined && !isNaN(course) ? course : undefined,
      });
    } catch (e) {
      errors.push(`GPXポイントの解析エラー: ${e}`);
    }
  }

  return { points, errors };
}
