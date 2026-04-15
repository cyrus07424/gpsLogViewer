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

interface MapViewProps {
  points: GpsPoint[];
  colorBySpeed: boolean;
}

function speedColor(speed?: number, maxSpeed?: number): string {
  if (speed === undefined || maxSpeed === undefined || maxSpeed === 0) return "#3b82f6";
  const ratio = Math.min(speed / maxSpeed, 1);
  // green → yellow → red
  const r = Math.round(ratio < 0.5 ? ratio * 2 * 255 : 255);
  const g = Math.round(ratio < 0.5 ? 255 : (1 - ratio) * 2 * 255);
  return `rgb(${r},${g},0)`;
}

export default function MapView({ points, colorBySpeed }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const trackLayerRef = useRef<L.LayerGroup | null>(null);

  // Initialize map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [35.6812, 139.7671], // Tokyo as default
      zoom: 13,
      zoomControl: true,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);

    trackLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    return () => {
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

    if (colorBySpeed && maxSpeed && maxSpeed > 0) {
      // Draw colored segments
      for (let i = 1; i < points.length; i++) {
        const color = speedColor(points[i].speed, maxSpeed);
        L.polyline(
          [
            [points[i - 1].lat, points[i - 1].lng],
            [points[i].lat, points[i].lng],
          ],
          { color, weight: 4, opacity: 0.85 }
        ).addTo(layer);
      }
    } else {
      L.polyline(latLngs, {
        color: "#3b82f6",
        weight: 4,
        opacity: 0.85,
      }).addTo(layer);
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
      .bindPopup(
        `<b>スタート</b><br>${startPoint.timestamp?.toLocaleString() ?? ""}` +
          (startPoint.altitude !== undefined
            ? `<br>高度: ${startPoint.altitude.toFixed(1)} m`
            : "")
      )
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
      .bindPopup(
        `<b>ゴール</b><br>${endPoint.timestamp?.toLocaleString() ?? ""}` +
          (endPoint.altitude !== undefined
            ? `<br>高度: ${endPoint.altitude.toFixed(1)} m`
            : "")
      )
      .addTo(layer);

    // Add clickable waypoint markers every Nth point
    const step = Math.max(1, Math.floor(points.length / 50));
    for (let i = 0; i < points.length; i += step) {
      const p = points[i];
      const dotIcon = L.circleMarker([p.lat, p.lng], {
        radius: 4,
        fillColor: colorBySpeed ? speedColor(p.speed, maxSpeed) : "#3b82f6",
        color: "#fff",
        weight: 1,
        fillOpacity: 0.9,
      });
      const popup = [
        p.timestamp ? `<b>${p.timestamp.toLocaleString()}</b>` : "",
        p.speed !== undefined ? `速度: ${p.speed.toFixed(1)} km/h` : "",
        p.altitude !== undefined ? `高度: ${p.altitude.toFixed(1)} m` : "",
        p.satellites !== undefined ? `衛星数: ${p.satellites}` : "",
        p.hdop !== undefined ? `HDOP: ${p.hdop.toFixed(1)}` : "",
      ]
        .filter(Boolean)
        .join("<br>");
      if (popup) dotIcon.bindPopup(popup);
      dotIcon.addTo(layer);
    }

    // Fit map to track bounds
    const bounds = L.latLngBounds(latLngs);
    map.fitBounds(bounds, { padding: [40, 40] });
  }, [points, colorBySpeed]);

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: "100%", position: "absolute", inset: 0 }}
    />
  );
}
