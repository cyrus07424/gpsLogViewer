import type { GpsPoint } from "./nmeaParser";

export interface MapLabels {
  speed: string;
  altitude: string;
  satellites: string;
  startMarker: string;
  endMarker: string;
}

export type MarkerType = "circle" | "arrow";

export interface MapViewProps {
  points: GpsPoint[];
  colorBySpeed: boolean;
  seekPoint?: GpsPoint | null;
  seekIndex?: number;
  markerType?: MarkerType;
  centerOnMarker?: boolean;
  headingUp?: boolean;
  mapLabels?: MapLabels;
}

export const DEFAULT_MAP_LABELS: MapLabels = {
  speed: "速度",
  altitude: "高度",
  satellites: "衛星数",
  startMarker: "スタート",
  endMarker: "ゴール",
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]!);
}

export function buildTooltipContent(p: GpsPoint, labels: MapLabels, label?: string): string {
  return [
    label ? `<b>${escapeHtml(label)}</b>` : "",
    p.timestamp ? `<b>${escapeHtml(p.timestamp.toLocaleString())}</b>` : "",
    `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`,
    p.speed !== undefined ? `${escapeHtml(labels.speed)}: ${p.speed.toFixed(1)} km/h` : "",
    p.altitude !== undefined ? `${escapeHtml(labels.altitude)}: ${p.altitude.toFixed(1)} m` : "",
    p.satellites !== undefined ? `${escapeHtml(labels.satellites)}: ${p.satellites}` : "",
    p.hdop !== undefined ? `HDOP: ${p.hdop.toFixed(1)}` : "",
  ].filter(Boolean).join("<br>");
}

export function speedColor(speed?: number, maxSpeed?: number): string {
  if (speed === undefined || maxSpeed === undefined || maxSpeed === 0) return "#3b82f6";
  const ratio = Math.min(speed / maxSpeed, 1);
  const r = Math.round(ratio < 0.5 ? ratio * 2 * 255 : 255);
  const g = Math.round(ratio < 0.5 ? 255 : (1 - ratio) * 2 * 255);
  return `rgb(${r},${g},0)`;
}

export function calcBearing(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export function resolvePointBearing(point: GpsPoint, index: number | undefined, points: GpsPoint[]): number {
  if (point.course !== undefined) return point.course;
  if (index !== undefined && index > 0) {
    const prev = points[index - 1];
    if (prev) return calcBearing(prev.lat, prev.lng, point.lat, point.lng);
  }
  if ((index === undefined || index === 0) && points.length > 1) {
    return calcBearing(point.lat, point.lng, points[1].lat, points[1].lng);
  }
  return 0;
}

export function buildTrackGeoJSON(points: GpsPoint[], colorBySpeed: boolean) {
  const maxSpeed = colorBySpeed
    ? points.reduce((max, point) => Math.max(max, point.speed ?? 0), 0)
    : 0;
  const features = points.length < 2 ? [] : colorBySpeed && maxSpeed > 0
    ? points.slice(1).map((point, index) => ({
        type: "Feature" as const,
        properties: { color: speedColor(point.speed, maxSpeed) },
        geometry: {
          type: "LineString" as const,
          coordinates: [[points[index].lng, points[index].lat], [point.lng, point.lat]],
        },
      }))
    : [{
        type: "Feature" as const,
        properties: { color: "#3b82f6" },
        geometry: {
          type: "LineString" as const,
          coordinates: points.map((point) => [point.lng, point.lat]),
        },
      }];
  return { type: "FeatureCollection" as const, features };
}
