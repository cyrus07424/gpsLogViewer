"use client";

import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { type GpsPoint } from "../lib/nmeaParser";
import { type MapLabels, type MarkerType } from "./MapView";

// ──────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────
const DEFAULT_MAP_LABELS: MapLabels = {
  speed: "速度",
  altitude: "高度",
  satellites: "衛星数",
  startMarker: "スタート",
  endMarker: "ゴール",
};

const DEFAULT_CENTER: [number, number] = [139.7671, 35.6812]; // Tokyo

const GSI_ATTRIBUTION =
  '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noreferrer">地理院タイル</a>';
const GSI_VECTOR_ATTRIBUTION =
  '<a href="https://github.com/gsi-cyberjapan/gsimaps-vector-experiment" target="_blank" rel="noreferrer">国土地理院ベクトルタイル提供実験</a>';

// ──────────────────────────────────────────────
// Basemap definitions
// ──────────────────────────────────────────────
export type BasemapId = "gsi-std" | "gsi-pale" | "gsi-photo" | "gsi-blank" | "gsi-vector" | "osm";

export const BASEMAP_LABELS: Record<BasemapId, string> = {
  "gsi-std":    "地理院標準",
  "gsi-pale":   "地理院淡色",
  "gsi-photo":  "空中写真",
  "gsi-blank":  "地理院白地図",
  "gsi-vector": "地理院ベクター",
  osm:          "OpenStreetMap",
};

function makeRasterStyle(
  tiles: string[],
  attribution: string,
  tileSize = 256,
  maxzoom = 18,
): maplibregl.StyleSpecification {
  return {
    version: 8,
    glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
    sources: {
      basemap: { type: "raster", tiles, tileSize, attribution, maxzoom },
    },
    layers: [{ id: "basemap-raster", type: "raster", source: "basemap" }],
  };
}

/** GSI ベクトルタイルスタイル（白地図 + MVT レイヤー） */
function makeGsiVectorStyle(): maplibregl.StyleSpecification {
  return {
    version: 8,
    glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
    sources: {
      "gsi-blank": {
        type: "raster",
        tiles: ["https://cyberjapandata.gsi.go.jp/xyz/blank/{z}/{x}/{y}.png"],
        tileSize: 256,
        attribution: GSI_ATTRIBUTION,
        maxzoom: 14,
      },
      "gsi-vec": {
        type: "vector",
        tiles: ["https://cyberjapandata.gsi.go.jp/xyz/experimental_bvmap/{z}/{x}/{y}.pbf"],
        maxzoom: 17,
        attribution: GSI_VECTOR_ATTRIBUTION,
      },
    },
    layers: [
      { id: "blank", type: "raster", source: "gsi-blank" },
      {
        id: "waterarea",
        type: "fill",
        source: "gsi-vec",
        "source-layer": "waterarea",
        paint: { "fill-color": "#aad3df", "fill-opacity": 0.7 },
      },
      {
        id: "lake",
        type: "fill",
        source: "gsi-vec",
        "source-layer": "lake",
        paint: { "fill-color": "#aad3df", "fill-opacity": 0.7 },
      },
      {
        id: "river",
        type: "line",
        source: "gsi-vec",
        "source-layer": "river",
        paint: { "line-color": "#0ea5e9", "line-width": 1 },
      },
      {
        id: "building",
        type: "fill",
        source: "gsi-vec",
        "source-layer": "building",
        paint: { "fill-color": "#d6d0c8", "fill-opacity": 0.7 },
      },
      {
        id: "road",
        type: "line",
        source: "gsi-vec",
        "source-layer": "road",
        paint: {
          "line-color": "#ffffff",
          "line-width": ["interpolate", ["linear"], ["zoom"], 10, 0.8, 14, 3, 18, 8],
        },
      },
      {
        id: "road-outline",
        type: "line",
        source: "gsi-vec",
        "source-layer": "road",
        paint: {
          "line-color": "#aaaaaa",
          "line-width": ["interpolate", ["linear"], ["zoom"], 10, 1.5, 14, 4.5, 18, 10],
        },
        layout: { "line-sort-key": -1 },
      },
      {
        id: "railway",
        type: "line",
        source: "gsi-vec",
        "source-layer": "railway",
        paint: {
          "line-color": "#4b5563",
          "line-width": 1.5,
          "line-dasharray": [4, 2],
        },
      },
    ],
  };
}

function createBaseStyle(id: BasemapId): maplibregl.StyleSpecification {
  switch (id) {
    case "gsi-std":
      return makeRasterStyle(
        ["https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png"],
        GSI_ATTRIBUTION,
        256,
        18,
      );
    case "gsi-pale":
      return makeRasterStyle(
        ["https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png"],
        GSI_ATTRIBUTION,
        256,
        18,
      );
    case "gsi-photo":
      return makeRasterStyle(
        ["https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg"],
        GSI_ATTRIBUTION,
        256,
        18,
      );
    case "gsi-blank":
      return makeRasterStyle(
        ["https://cyberjapandata.gsi.go.jp/xyz/blank/{z}/{x}/{y}.png"],
        GSI_ATTRIBUTION,
        256,
        14,
      );
    case "gsi-vector":
      return makeGsiVectorStyle();
    case "osm":
      return makeRasterStyle(
        [
          "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png",
          "https://b.tile.openstreetmap.org/{z}/{x}/{y}.png",
          "https://c.tile.openstreetmap.org/{z}/{x}/{y}.png",
        ],
        '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
        256,
        19,
      );
  }
}

// ──────────────────────────────────────────────
// Props
// ──────────────────────────────────────────────
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

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────
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

function speedColor(speed?: number, maxSpeed?: number): string {
  if (speed === undefined || maxSpeed === undefined || maxSpeed === 0) return "#3b82f6";
  const ratio = Math.min(speed / maxSpeed, 1);
  const r = Math.round(ratio < 0.5 ? ratio * 2 * 255 : 255);
  const g = Math.round(ratio < 0.5 ? 255 : (1 - ratio) * 2 * 255);
  return `rgb(${r},${g},0)`;
}

function calcBearing(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

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

function findNearestPoint(points: GpsPoint[], lat: number, lng: number): GpsPoint {
  let nearest = points[0];
  let minDist = Infinity;
  for (const p of points) {
    const d = (p.lat - lat) ** 2 + (p.lng - lng) ** 2;
    if (d < minDist) { minDist = d; nearest = p; }
  }
  return nearest;
}

function createCircleElement(color: string, size: number, borderWidth = 2): HTMLDivElement {
  const el = document.createElement("div");
  el.style.background = color;
  el.style.width = `${size}px`;
  el.style.height = `${size}px`;
  el.style.borderRadius = "50%";
  el.style.border = `${borderWidth}px solid white`;
  el.style.boxShadow = "0 1px 4px rgba(0,0,0,0.4)";
  el.style.boxSizing = "border-box";
  el.style.pointerEvents = "none";
  return el;
}

function createArrowElement(bearingDeg: number): HTMLDivElement {
  const safeDeg = Number.isFinite(bearingDeg) ? bearingDeg % 360 : 0;
  const el = document.createElement("div");
  el.style.width = "28px";
  el.style.height = "28px";
  el.style.pointerEvents = "none";
  const inner = document.createElement("div");
  inner.dataset.arrowInner = "true";
  inner.style.width = "28px";
  inner.style.height = "28px";
  inner.style.transformOrigin = "center center";
  inner.style.transform = `rotate(${safeDeg}deg)`;
  inner.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28" style="display:block">
      <polygon points="14,2 22,24 14,19 6,24" fill="#f97316" stroke="#fff" stroke-width="2" stroke-linejoin="round"/>
    </svg>`;
  el.appendChild(inner);
  return el;
}

function buildTrackGeoJSON(points: GpsPoint[], colorBySpeed: boolean) {
  const maxSpeed = colorBySpeed ? Math.max(...points.map((p) => p.speed ?? 0)) : undefined;
  const features =
    colorBySpeed && maxSpeed && maxSpeed > 0
      ? points.slice(1).map((point, index) => ({
          type: "Feature" as const,
          properties: { color: speedColor(point.speed, maxSpeed) },
          geometry: {
            type: "LineString" as const,
            coordinates: [[points[index].lng, points[index].lat], [point.lng, point.lat]],
          },
        }))
      : points.length > 0
        ? [{
            type: "Feature" as const,
            properties: { color: "#3b82f6" },
            geometry: {
              type: "LineString" as const,
              coordinates: points.map((p) => [p.lng, p.lat]),
            },
          }]
        : [];
  return { type: "FeatureCollection" as const, features };
}

function addTrackLayers(map: maplibregl.Map) {
  if (!map.getSource("track")) {
    map.addSource("track", {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
  }
  if (!map.getLayer("track-line")) {
    map.addLayer({
      id: "track-line",
      type: "line",
      source: "track",
      paint: {
        "line-color": ["get", "color"],
        "line-width": 4,
        "line-opacity": 0.85,
      },
    });
  }
  if (!map.getLayer("track-hover")) {
    map.addLayer({
      id: "track-hover",
      type: "line",
      source: "track",
      paint: { "line-color": "#000000", "line-width": 20, "line-opacity": 0.001 },
    });
  }
}

function ensureMarkerRef(
  markerRef: MutableRefObject<maplibregl.Marker | null>,
  map: maplibregl.Map,
  element: HTMLElement,
  lngLat: [number, number],
) {
  if (markerRef.current) {
    markerRef.current.setLngLat(lngLat);
    return;
  }
  markerRef.current = new maplibregl.Marker({ element, anchor: "center" })
    .setLngLat(lngLat)
    .addTo(map);
}

// ──────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────
export default function MapLibreView({
  points,
  colorBySpeed,
  seekPoint,
  seekIndex,
  markerType = "circle",
  centerOnMarker = false,
  headingUp = false,
  mapLabels,
}: MapViewProps) {
  const labels = mapLabels ?? DEFAULT_MAP_LABELS;

  const [basemap, setBasemap] = useState<BasemapId>("gsi-std");
  const [layerOpen, setLayerOpen] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const trackPopupRef = useRef<maplibregl.Popup | null>(null);
  const seekPopupRef = useRef<maplibregl.Popup | null>(null);
  const seekMarkerRef = useRef<maplibregl.Marker | null>(null);
  const startMarkerRef = useRef<maplibregl.Marker | null>(null);
  const endMarkerRef = useRef<maplibregl.Marker | null>(null);
  const hoverHandlersRef = useRef<{
    move: (e: maplibregl.MapLayerMouseEvent) => void;
    leave: () => void;
  } | null>(null);

  // Keep latest values in refs so event handlers stay stable
  const pointsRef = useRef(points);
  const labelsRef = useRef(labels);
  const trackData = useMemo(() => buildTrackGeoJSON(points, colorBySpeed), [points, colorBySpeed]);
  const trackDataRef = useRef(trackData);
  const basemapRef = useRef(basemap);
  const isFirstRenderRef = useRef(true);

  useEffect(() => { pointsRef.current = points; }, [points]);
  useEffect(() => { labelsRef.current = labels; }, [labels]);
  useEffect(() => { trackDataRef.current = trackData; }, [trackData]);
  useEffect(() => { basemapRef.current = basemap; }, [basemap]);

  // ── Setup hover handlers (stable, reads from refs) ──────────────
  const setupHoverHandlers = (map: maplibregl.Map) => {
    if (hoverHandlersRef.current) {
      map.off("mousemove", "track-hover", hoverHandlersRef.current.move);
      map.off("mouseleave", "track-hover", hoverHandlersRef.current.leave);
    }
    const popup = trackPopupRef.current
      ?? new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 12 });
    trackPopupRef.current = popup;

    const move = (e: maplibregl.MapLayerMouseEvent) => {
      const pts = pointsRef.current;
      if (pts.length === 0) return;
      const nearest = findNearestPoint(pts, e.lngLat.lat, e.lngLat.lng);
      popup.setLngLat(e.lngLat).setHTML(buildTooltipContent(nearest, labelsRef.current)).addTo(map);
    };
    const leave = () => popup.remove();
    hoverHandlersRef.current = { move, leave };
    map.on("mousemove", "track-hover", move);
    map.on("mouseleave", "track-hover", leave);
  };

  // ── Restore track + start/end markers after style change ─────────
  const restoreAfterStyleLoad = (map: maplibregl.Map) => {
    addTrackLayers(map);
    const src = map.getSource("track") as maplibregl.GeoJSONSource | undefined;
    src?.setData(trackDataRef.current as never);
    setupHoverHandlers(map);

    const pts = pointsRef.current;
    if (pts.length > 0) {
      const start = pts[0];
      const end = pts[pts.length - 1];
      // Markers survive setStyle (DOM elements), but we need to re-add if they were removed
      if (!startMarkerRef.current) {
        startMarkerRef.current = new maplibregl.Marker({ element: createCircleElement("#22c55e", 14, 2), anchor: "center" })
          .setLngLat([start.lng, start.lat])
          .addTo(map);
      }
      if (!endMarkerRef.current) {
        endMarkerRef.current = new maplibregl.Marker({ element: createCircleElement("#ef4444", 14, 2), anchor: "center" })
          .setLngLat([end.lng, end.lat])
          .addTo(map);
      }
    }
  };

  // ── Initialize map ───────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: createBaseStyle(basemapRef.current),
      center: DEFAULT_CENTER,
      zoom: 13,
      maxZoom: 22,
      attributionControl: false,
      pitchWithRotate: false,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-left");

    map.on("load", () => {
      restoreAfterStyleLoad(map);
    });

    mapRef.current = map;

    return () => {
      hoverHandlersRef.current = null;
      seekMarkerRef.current?.remove(); seekMarkerRef.current = null;
      seekPopupRef.current?.remove(); seekPopupRef.current = null;
      startMarkerRef.current?.remove(); startMarkerRef.current = null;
      endMarkerRef.current?.remove(); endMarkerRef.current = null;
      trackPopupRef.current?.remove(); trackPopupRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Switch basemap ───────────────────────────────────────────────
  useEffect(() => {
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false;
      return;
    }
    const map = mapRef.current;
    if (!map) return;

    // Markers are DOM elements and survive setStyle — remove them so
    // restoreAfterStyleLoad can recreate them cleanly.
    startMarkerRef.current?.remove(); startMarkerRef.current = null;
    endMarkerRef.current?.remove(); endMarkerRef.current = null;

    map.once("style.load", () => restoreAfterStyleLoad(map));
    map.setStyle(createBaseStyle(basemap));
  }, [basemap]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Update track data ────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    addTrackLayers(map);
    const src = map.getSource("track") as maplibregl.GeoJSONSource | undefined;
    src?.setData(trackData as never);

    if (points.length === 0) {
      startMarkerRef.current?.remove(); startMarkerRef.current = null;
      endMarkerRef.current?.remove(); endMarkerRef.current = null;
      return;
    }

    ensureMarkerRef(startMarkerRef, map, createCircleElement("#22c55e", 14, 2), [points[0].lng, points[0].lat]);
    ensureMarkerRef(endMarkerRef, map, createCircleElement("#ef4444", 14, 2), [points[points.length - 1].lng, points[points.length - 1].lat]);
  }, [trackData, points]);

  // ── Fit bounds ───────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !points.length) return;
    if (points.length === 1) {
      map.jumpTo({ center: [points[0].lng, points[0].lat], zoom: 15 });
      return;
    }
    const bounds = new maplibregl.LngLatBounds();
    for (const p of points) bounds.extend([p.lng, p.lat]);
    map.fitBounds(bounds, { padding: 40, duration: 0 });
  }, [points]);

  // ── Seek marker ──────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !seekPoint) {
      seekMarkerRef.current?.remove(); seekMarkerRef.current = null;
      seekPopupRef.current?.remove(); seekPopupRef.current = null;
      return;
    }

    const lngLat: [number, number] = [seekPoint.lng, seekPoint.lat];
    if (centerOnMarker) map.jumpTo({ center: lngLat });

    const bearing = resolvePointBearing(seekPoint, seekIndex, points);
    const arrowDeg = headingUp ? 0 : bearing;

    const needRebuild =
      !seekMarkerRef.current ||
      (markerType === "arrow" && seekMarkerRef.current.getElement().dataset.markerType !== "arrow") ||
      (markerType === "circle" && seekMarkerRef.current.getElement().dataset.markerType !== "circle");

    if (needRebuild) {
      seekMarkerRef.current?.remove();
      const el = markerType === "arrow" ? createArrowElement(arrowDeg) : createCircleElement("#f97316", 18, 2.5);
      el.dataset.markerType = markerType;
      seekMarkerRef.current = new maplibregl.Marker({ element: el, anchor: "center" }).setLngLat(lngLat).addTo(map);
    } else {
      const marker = seekMarkerRef.current;
      if (!marker) return;
      marker.setLngLat(lngLat);
      if (markerType === "arrow") {
        const inner = marker.getElement().querySelector("[data-arrow-inner]") as HTMLElement | null;
        if (inner) inner.style.transform = `rotate(${arrowDeg}deg)`;
      }
    }

    seekPopupRef.current ??= new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 16 });
    seekPopupRef.current.setLngLat(lngLat).setHTML(buildTooltipContent(seekPoint, labels)).addTo(map);
  }, [seekPoint, seekIndex, markerType, points, centerOnMarker, headingUp, labels]);

  // ── Heading-up ───────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!headingUp || !seekPoint) { map.setBearing(0); return; }
    const travelBearing = resolvePointBearing(seekPoint, seekIndex, points);
    map.setBearing((360 - travelBearing) % 360);
  }, [headingUp, seekPoint, seekIndex, points]);

  // ── Render ───────────────────────────────────────────────────────
  return (
    <div style={{ width: "100%", height: "100%", position: "absolute", inset: 0 }}>
      {/* Map canvas */}
      <div ref={containerRef} style={{ width: "100%", height: "100%", position: "absolute", inset: 0 }} />

      {/* Layer switcher — positioned to sit below the NmeaViewer top-right controls */}
      <div
        className="absolute"
        style={{ top: "72px", right: "10px", zIndex: 400 }}
      >
        {layerOpen ? (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-600 overflow-hidden min-w-[140px]">
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 dark:border-gray-600">
              <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">ベースマップ</span>
              <button
                onClick={() => setLayerOpen(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xs ml-2"
                aria-label="閉じる"
              >
                ✕
              </button>
            </div>
            {/* Options */}
            <div className="py-1">
              {(Object.entries(BASEMAP_LABELS) as [BasemapId, string][]).map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => { setBasemap(id); setLayerOpen(false); }}
                  className={`w-full text-left px-3 py-1.5 text-xs transition-colors flex items-center gap-2 ${
                    basemap === id
                      ? "text-blue-600 dark:text-blue-400 font-semibold bg-blue-50 dark:bg-blue-900/20"
                      : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${basemap === id ? "bg-blue-500" : "bg-gray-300 dark:bg-gray-600"}`} />
                  {label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <button
            onClick={() => setLayerOpen(true)}
            className="bg-white dark:bg-gray-800 rounded shadow-md border border-gray-200 dark:border-gray-600 px-2 py-1.5 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center gap-1.5"
            title="ベースマップ切り替え"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/>
              <line x1="9" y1="3" x2="9" y2="18"/>
              <line x1="15" y1="6" x2="15" y2="21"/>
            </svg>
            {BASEMAP_LABELS[basemap]}
          </button>
        )}
      </div>
    </div>
  );
}

