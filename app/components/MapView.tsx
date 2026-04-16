"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { type GpsPoint } from "../lib/nmeaParser";

// Fix Leaflet default icon path issue in Next.js
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

function buildTooltipContent(p: GpsPoint, label?: string): string {
  return [
    label ? `<b>${label}</b>` : "",
    p.timestamp ? `<b>${p.timestamp.toLocaleString()}</b>` : "",
    p.speed !== undefined ? `速度: ${p.speed.toFixed(1)} km/h` : "",
    p.altitude !== undefined ? `高度: ${p.altitude.toFixed(1)} m` : "",
    p.satellites !== undefined ? `衛星数: ${p.satellites}` : "",
    p.hdop !== undefined ? `HDOP: ${p.hdop.toFixed(1)}` : "",
  ]
    .filter(Boolean)
    .join("<br>");
}

interface MapViewProps {
  points: GpsPoint[];
  colorBySpeed: boolean;
  seekPoint?: GpsPoint | null;
}

function speedColor(speed?: number, maxSpeed?: number): string {
  if (speed === undefined || maxSpeed === undefined || maxSpeed === 0) return "#3b82f6";
  const ratio = Math.min(speed / maxSpeed, 1);
  // green → yellow → red
  const r = Math.round(ratio < 0.5 ? ratio * 2 * 255 : 255);
  const g = Math.round(ratio < 0.5 ? 255 : (1 - ratio) * 2 * 255);
  return `rgb(${r},${g},0)`;
}

export default function MapView({ points, colorBySpeed, seekPoint }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const trackLayerRef = useRef<L.LayerGroup | null>(null);
  const seekMarkerRef = useRef<L.CircleMarker | null>(null);

  // Initialize map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [35.6812, 139.7671], // Tokyo as default
      zoom: 13,
      zoomControl: false,
    });
    L.control.zoom({ position: "bottomright" }).addTo(map);

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
        const content = buildTooltipContent(nearest);
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
        const content = buildTooltipContent(nearest);
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
      .bindTooltip(buildTooltipContent(startPoint, "スタート"), { sticky: true })
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
      .bindTooltip(buildTooltipContent(endPoint, "ゴール"), { sticky: true })
      .addTo(layer);

    // Fit map to track bounds
    const bounds = L.latLngBounds(latLngs);
    map.fitBounds(bounds, { padding: [40, 40] });
  }, [points, colorBySpeed]);

  // Update seek position marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!seekPoint) {
      if (seekMarkerRef.current) {
        seekMarkerRef.current.remove();
        seekMarkerRef.current = null;
      }
      return;
    }

    const latlng: [number, number] = [seekPoint.lat, seekPoint.lng];
    const content = buildTooltipContent(seekPoint) || `${seekPoint.lat.toFixed(5)}, ${seekPoint.lng.toFixed(5)}`;

    if (seekMarkerRef.current) {
      seekMarkerRef.current.setLatLng(latlng);
      seekMarkerRef.current.setTooltipContent(content);
    } else {
      seekMarkerRef.current = L.circleMarker(latlng, {
        radius: 9,
        fillColor: "#f97316",
        fillOpacity: 0.95,
        color: "#fff",
        weight: 2.5,
        interactive: false,
      })
        .bindTooltip(content, { permanent: false, direction: "top", offset: [0, -12] })
        .addTo(map);
    }
  }, [seekPoint]);

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: "100%", position: "absolute", inset: 0 }}
    />
  );
}
