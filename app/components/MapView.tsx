"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-rotate";
import { type GpsPoint } from "../lib/nmeaParser";

// Fix Leaflet default icon path issue in Next.js
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

export interface MapLabels {
  speed: string;
  altitude: string;
  satellites: string;
  startMarker: string;
  endMarker: string;
}

const DEFAULT_MAP_LABELS: MapLabels = {
  speed: "速度",
  altitude: "高度",
  satellites: "衛星数",
  startMarker: "スタート",
  endMarker: "ゴール",
};

function buildTooltipContent(p: GpsPoint, labels: MapLabels, label?: string): string {
  return [
    label ? `<b>${label}</b>` : "",
    p.timestamp ? `<b>${p.timestamp.toLocaleString()}</b>` : "",
    `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`,
    p.speed !== undefined ? `${labels.speed}: ${p.speed.toFixed(1)} km/h` : "",
    p.altitude !== undefined ? `${labels.altitude}: ${p.altitude.toFixed(1)} m` : "",
    p.satellites !== undefined ? `${labels.satellites}: ${p.satellites}` : "",
    p.hdop !== undefined ? `HDOP: ${p.hdop.toFixed(1)}` : "",
  ]
    .filter(Boolean)
    .join("<br>");
}

export type MarkerType = "circle" | "arrow";

interface MapViewProps {
  points: GpsPoint[];
  colorBySpeed: boolean;
  seekPoint?: GpsPoint | null;
  seekIndex?: number;
  markerType?: MarkerType;
  centerOnMarker?: boolean;
  headingUp?: boolean;
  mapLabels?: MapLabels;
}

function speedColor(speed?: number, maxSpeed?: number): string {
  if (speed === undefined || maxSpeed === undefined || maxSpeed === 0) return "#3b82f6";
  const ratio = Math.min(speed / maxSpeed, 1);
  // green → yellow → red
  const r = Math.round(ratio < 0.5 ? ratio * 2 * 255 : 255);
  const g = Math.round(ratio < 0.5 ? 255 : (1 - ratio) * 2 * 255);
  return `rgb(${r},${g},0)`;
}

/** Calculate bearing in degrees (0–360) from point a to point b. */
function calcBearing(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Build a Leaflet divIcon with a CSS circle for the seek position marker.
 * Uses a divIcon instead of L.circleMarker so that the marker is placed as a
 * plain DOM element in the custom pane, avoiding SVG renderer pane incompatibilities
 * with leaflet-rotate.
 */
function buildCircleIcon(): L.DivIcon {
  return L.divIcon({
    html: `<div style="background:#f97316;width:18px;height:18px;border-radius:50%;border:2.5px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.4)"></div>`,
    className: "",
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

/** Build a Leaflet divIcon with an arrow SVG rotated to bearingDeg (0 = north). */
function buildArrowIcon(bearingDeg: number): L.DivIcon {
  const safeDeg = Number.isFinite(bearingDeg) ? bearingDeg % 360 : 0;
  return L.divIcon({
    html: `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28"
      style="transform:rotate(${safeDeg}deg);display:block;">
      <polygon points="14,2 22,24 14,19 6,24"
        fill="#f97316" stroke="#fff" stroke-width="2" stroke-linejoin="round"/>
    </svg>`,
    className: "",
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

/** Resolve the travel bearing (0–360) for a given point in a track. */
function resolvePointBearing(point: GpsPoint, index: number | undefined, points: GpsPoint[]): number {
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

export default function MapView({ points, colorBySpeed, seekPoint, seekIndex, markerType = "circle", centerOnMarker = false, headingUp = false, mapLabels }: MapViewProps) {
  const labels = mapLabels ?? DEFAULT_MAP_LABELS;
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const trackLayerRef = useRef<L.LayerGroup | null>(null);
  const seekMarkerRef = useRef<L.Marker | null>(null);
  const seekMarkerTypeRef = useRef<MarkerType | null>(null);

  // Initialize map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [35.6812, 139.7671], // Tokyo as default
      zoom: 13,
      zoomControl: false,
      rotate: true,
      bearing: 0,
      rotateControl: { position: "topright" },
    });
    L.control.zoom({ position: "bottomright" }).addTo(map);

    // Custom pane for the seek marker so it always renders above track polylines
    map.createPane("seekMarkerPane");
    (map.getPane("seekMarkerPane") as HTMLElement).style.zIndex = "650";

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);

    trackLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    return () => {
      if (seekMarkerRef.current) {
        seekMarkerRef.current.remove();
        seekMarkerRef.current = null;
        seekMarkerTypeRef.current = null;
      }
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update track when points change
  useEffect(() => {
    const map = mapRef.current;
    const layer = trackLayerRef.current;
    if (!map || !layer) return;

    layer.clearLayers();

    if (points.length === 0) return;

    const maxSpeed = colorBySpeed
      ? Math.max(...points.map((p) => p.speed ?? 0))
      : undefined;

    const latLngs = points.map((p) => [p.lat, p.lng] as [number, number]);

    // Helper: find the nearest GPS point to a given latlng
    const findNearest = (latlng: L.LatLng): GpsPoint => {
      let nearest = points[0];
      let minDist = Infinity;
      for (const p of points) {
        const dlat = p.lat - latlng.lat;
        const dlng = p.lng - latlng.lng;
        const d = dlat * dlat + dlng * dlng;
        if (d < minDist) { minDist = d; nearest = p; }
      }
      return nearest;
    };

    if (colorBySpeed && maxSpeed && maxSpeed > 0) {
      // Draw colored segments (non-interactive, visual only)
      for (let i = 1; i < points.length; i++) {
        const color = speedColor(points[i].speed, maxSpeed);
        L.polyline(
          [
            [points[i - 1].lat, points[i - 1].lng],
            [points[i].lat, points[i].lng],
          ],
          { color, weight: 4, opacity: 0.85, interactive: false }
        ).addTo(layer);
      }
      // Invisible wide overlay polyline for tooltip interaction along the whole track
      const hoverLine = L.polyline(latLngs, {
        weight: 20,
        opacity: 0.001,
        color: "#000",
        interactive: true,
      });
      hoverLine.bindTooltip("", { sticky: true });
      hoverLine.on("mousemove", (e: L.LeafletMouseEvent) => {
        const nearest = findNearest(e.latlng);
        const content = buildTooltipContent(nearest, labels);
        if (content) hoverLine.setTooltipContent(content);
      });
      hoverLine.addTo(layer);
    } else {
      const pl = L.polyline(latLngs, {
        color: "#3b82f6",
        weight: 4,
        opacity: 0.85,
      });
      pl.bindTooltip("", { sticky: true });
      pl.on("mousemove", (e: L.LeafletMouseEvent) => {
        const nearest = findNearest(e.latlng);
        const content = buildTooltipContent(nearest, labels);
        if (content) pl.setTooltipContent(content);
      });
      pl.addTo(layer);
    }

    // Start marker (green)
    const startPoint = points[0];
    const startIcon = L.divIcon({
      html: `<div style="background:#22c55e;width:14px;height:14px;border-radius:50%;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.4)"></div>`,
      className: "",
      iconSize: [14, 14],
      iconAnchor: [7, 7],
    });
    L.marker([startPoint.lat, startPoint.lng], { icon: startIcon })
      .bindTooltip(buildTooltipContent(startPoint, labels, labels.startMarker), { sticky: true })
      .addTo(layer);

    // End marker (red)
    const endPoint = points[points.length - 1];
    const endIcon = L.divIcon({
      html: `<div style="background:#ef4444;width:14px;height:14px;border-radius:50%;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.4)"></div>`,
      className: "",
      iconSize: [14, 14],
      iconAnchor: [7, 7],
    });
    L.marker([endPoint.lat, endPoint.lng], { icon: endIcon })
      .bindTooltip(buildTooltipContent(endPoint, labels, labels.endMarker), { sticky: true })
      .addTo(layer);

  }, [points, colorBySpeed, labels]);

  // Fit map to track bounds only when points change (not when colorBySpeed changes)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || points.length === 0) return;
    const latLngs = points.map((p) => [p.lat, p.lng] as [number, number]);
    const bounds = L.latLngBounds(latLngs);
    map.fitBounds(bounds, { padding: [40, 40] });
  }, [points]);

  // Update seek position marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!seekPoint) {
      if (seekMarkerRef.current) {
        seekMarkerRef.current.remove();
        seekMarkerRef.current = null;
        seekMarkerTypeRef.current = null;
      }
      return;
    }

    const latlng: [number, number] = [seekPoint.lat, seekPoint.lng];
    const content = buildTooltipContent(seekPoint, labels);

    // Center the map on the marker if requested
    if (centerOnMarker) {
      map.panTo(latlng, { animate: false });
    }

    // Determine bearing for arrow marker.
    // In heading-up mode the map is already rotated so that the travel direction
    // points up, and Leaflet keeps marker panes screen-aligned.  The arrow must
    // therefore always point straight up (0°) so it visually matches "forward".
    // In north-up mode the arrow is rotated to the absolute travel bearing.
    const bearing = resolvePointBearing(seekPoint, seekIndex, points);
    const arrowDeg = headingUp ? 0 : bearing;

    if (markerType === "arrow") {
      if (seekMarkerRef.current && seekMarkerTypeRef.current === "arrow") {
        seekMarkerRef.current.setLatLng(latlng);
        seekMarkerRef.current.setIcon(buildArrowIcon(arrowDeg));
        seekMarkerRef.current.setTooltipContent(content);
      } else {
        // Remove old circle marker if switching from circle to arrow
        if (seekMarkerRef.current) {
          seekMarkerRef.current.remove();
          seekMarkerRef.current = null;
        }
        seekMarkerRef.current = L.marker(latlng, {
          icon: buildArrowIcon(arrowDeg),
          interactive: false,
          pane: "seekMarkerPane",
        })
          .bindTooltip(content, { permanent: true, direction: "top", offset: [0, -16] })
          .addTo(map);
        seekMarkerTypeRef.current = "arrow";
      }
    } else {
      if (seekMarkerRef.current && seekMarkerTypeRef.current === "circle") {
        seekMarkerRef.current.setLatLng(latlng);
        seekMarkerRef.current.setTooltipContent(content);
      } else {
        // Remove old arrow marker if switching from arrow to circle
        if (seekMarkerRef.current) {
          seekMarkerRef.current.remove();
          seekMarkerRef.current = null;
        }
        seekMarkerRef.current = L.marker(latlng, {
          icon: buildCircleIcon(),
          interactive: false,
          pane: "seekMarkerPane",
        })
          .bindTooltip(content, { permanent: true, direction: "top", offset: [0, -16] })
          .addTo(map);
        seekMarkerTypeRef.current = "circle";
      }
    }
  }, [seekPoint, seekIndex, markerType, points, centerOnMarker, headingUp, labels]);

  // Update map bearing for heading-up / north-up mode
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!headingUp || !seekPoint) {
      // North-up: reset bearing to 0
      map.setBearing(0);
      return;
    }

    // Negate the travel bearing so the direction of travel points up on screen.
    // leaflet-rotate applies a clockwise CSS rotation equal to the bearing value,
    // so we need the complementary angle to bring the travel direction to the top.
    const travelBearing = resolvePointBearing(seekPoint, seekIndex, points);
    map.setBearing((360 - travelBearing) % 360);
  }, [headingUp, seekPoint, seekIndex, points]);

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: "100%", position: "absolute", inset: 0 }}
    />
  );
}
