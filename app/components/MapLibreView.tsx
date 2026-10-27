"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { type StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  buildTooltipContent, buildTrackGeoJSON, DEFAULT_MAP_LABELS, resolvePointBearing,
  type MapViewProps,
} from "../lib/mapUtils";
import type { Translations } from "../lib/i18n";
import { createGsiVectorStyle } from "../lib/gsiVector";

type BasemapId = "gsi-std" | "gsi-pale" | "gsi-photo" | "gsi-blank" | "gsi-vector" | "osm";
type UiLabels = Pick<Translations,
  "basemapTitle" | "gsiStd" | "gsiPale" | "gsiPhoto" | "gsiBlank" | "gsiVector" | "mapLoadError"
>;

const GSI_ATTRIBUTION =
  '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noreferrer">地理院タイル</a>';
const EMPTY_STYLE: StyleSpecification = { version: 8, sources: {}, layers: [] };

function createBaseStyle(id: BasemapId): StyleSpecification {
  if (id === "gsi-vector") return createGsiVectorStyle();
  const tileId = { "gsi-std": "std", "gsi-pale": "pale", "gsi-photo": "seamlessphoto",
    "gsi-blank": "blank", osm: "" }[id];
  const style: StyleSpecification = {
    version: 8,
    sources: {
      basemap: {
        type: "raster",
        tiles: [id === "osm"
          ? "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          : `https://cyberjapandata.gsi.go.jp/xyz/${tileId}/{z}/{x}/{y}.${id === "gsi-photo" ? "jpg" : "png"}`],
        tileSize: 256,
        maxzoom: id === "osm" ? 19 : tileId === "blank" ? 14 : 18,
        attribution: id === "osm"
          ? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          : GSI_ATTRIBUTION,
      },
    },
    layers: [{ id: "basemap", type: "raster", source: "basemap" }],
  };
  return style;
}

function createMarkerElement(color: string, size: number): HTMLDivElement {
  const element = document.createElement("div");
  Object.assign(element.style, {
    background: color, width: `${size}px`, height: `${size}px`, borderRadius: "50%",
    border: "2px solid white", boxShadow: "0 1px 4px rgba(0,0,0,0.4)", boxSizing: "border-box",
  });
  return element;
}

function createArrowElement(): HTMLDivElement {
  const element = document.createElement("div");
  element.style.width = "28px";
  element.style.height = "28px";
  element.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28"><polygon points="14,2 22,24 14,19 6,24" fill="#f97316" stroke="#fff" stroke-width="2" stroke-linejoin="round"/></svg>';
  return element;
}

export default function MapLibreView({
  points, colorBySpeed, seekPoint, seekIndex, markerType = "circle",
  centerOnMarker = false, headingUp = false, mapLabels, uiLabels,
}: MapViewProps & { uiLabels: UiLabels }) {
  const labels = mapLabels ?? DEFAULT_MAP_LABELS;
  const containerRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<maplibregl.Map | null>(null);
  const [basemap, setBasemap] = useState<BasemapId>("gsi-std");
  const [styleRevision, setStyleRevision] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const seekMarkerRef = useRef<maplibregl.Marker | null>(null);
  const seekPopupRef = useRef<maplibregl.Popup | null>(null);
  const trackData = useMemo(() => buildTrackGeoJSON(points, colorBySpeed), [points, colorBySpeed]);

  useEffect(() => {
    if (!containerRef.current) return;
    let instance: maplibregl.Map;
    try {
      instance = new maplibregl.Map({
        container: containerRef.current, style: EMPTY_STYLE,
        center: [139.7671, 35.6812], zoom: 13, maxZoom: 22,
        attributionControl: false,
      });
    } catch (error) {
      console.error("MapLibre initialization failed:", error);
      setLoadError(error instanceof Error ? error.message : String(error));
      return;
    }
    instance.addControl(new maplibregl.NavigationControl(), "bottom-right");
    instance.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
    instance.on("error", (event) => {
      console.error("MapLibre map error:", event.error);
      setLoadError(event.error.message);
    });
    instance.on("style.load", () => {
      instance.addSource("track", {
        type: "geojson", data: { type: "FeatureCollection", features: [] },
      });
      instance.addLayer({
        id: "track-line", type: "line", source: "track",
        paint: { "line-color": ["get", "color"], "line-width": 4, "line-opacity": 0.85 },
      });
      instance.addLayer({
        id: "track-hover", type: "line", source: "track",
        paint: { "line-color": "#000000", "line-width": 20, "line-opacity": 0 },
      });
      setStyleRevision((revision) => revision + 1);
    });
    setMap(instance);
    return () => { instance.remove(); };
  }, []);

  useEffect(() => {
    if (!map) return;
    setLoadError(null);
    map.setStyle(createBaseStyle(basemap), { diff: false });
  }, [map, basemap]);

  useEffect(() => {
    if (!map) return;
    const source = map.getSource<maplibregl.GeoJSONSource>("track");
    source?.setData(trackData);
  }, [map, styleRevision, trackData]);

  useEffect(() => {
    if (!map || points.length === 0) return;
    const endpoints = [
      { point: points[0], color: "#22c55e", label: labels.startMarker },
      { point: points[points.length - 1], color: "#ef4444", label: labels.endMarker },
    ].map(({ point, color, label }) => {
      const popup = new maplibregl.Popup({ closeButton: false, offset: 12 })
        .setHTML(buildTooltipContent(point, labels, label));
      const marker = new maplibregl.Marker({ element: createMarkerElement(color, 14) })
        .setLngLat([point.lng, point.lat]).setPopup(popup).addTo(map);
      const show = () => { popup.setLngLat(marker.getLngLat()).addTo(map); };
      const hide = () => { popup.remove(); };
      marker.getElement().addEventListener("mouseenter", show);
      marker.getElement().addEventListener("mouseleave", hide);
      return { marker, popup };
    });
    return () => { endpoints.forEach(({ marker, popup }) => { popup.remove(); marker.remove(); }); };
  }, [map, points, labels]);

  useEffect(() => {
    if (!map) return;
    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 12 });
    const move = (event: maplibregl.MapLayerMouseEvent) => {
      if (points.length === 0) return;
      let nearest = points[0];
      let minDistance = Infinity;
      for (const point of points) {
        const distance = (point.lat - event.lngLat.lat) ** 2 + (point.lng - event.lngLat.lng) ** 2;
        if (distance < minDistance) { nearest = point; minDistance = distance; }
      }
      popup.setLngLat(event.lngLat).setHTML(buildTooltipContent(nearest, labels)).addTo(map);
    };
    const leave = () => { popup.remove(); };
    map.on("mousemove", "track-hover", move);
    map.on("mouseleave", "track-hover", leave);
    return () => {
      map.off("mousemove", "track-hover", move);
      map.off("mouseleave", "track-hover", leave);
      popup.remove();
    };
  }, [map, points, labels]);

  useEffect(() => {
    if (!map || points.length === 0) return;
    const bounds = new maplibregl.LngLatBounds();
    for (const point of points) bounds.extend([point.lng, point.lat]);
    map.fitBounds(bounds, { padding: 40, maxZoom: points.length === 1 ? 15 : 18, duration: 0 });
  }, [map, points]);

  useEffect(() => {
    if (!map || !seekPoint) return;
    const marker = new maplibregl.Marker({
      element: markerType === "arrow" ? createArrowElement() : createMarkerElement("#f97316", 18),
      rotationAlignment: markerType === "arrow" ? "map" : "viewport",
      pitchAlignment: "viewport",
    }).setLngLat([seekPoint.lng, seekPoint.lat]).addTo(map);
    marker.getElement().style.zIndex = "1";
    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 16 })
      .setLngLat([seekPoint.lng, seekPoint.lat]).addTo(map);
    seekMarkerRef.current = marker;
    seekPopupRef.current = popup;
    return () => {
      popup.remove();
      marker.remove();
      seekMarkerRef.current = null;
      seekPopupRef.current = null;
    };
    // Position and content updates below keep the marker stable during playback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, markerType, !!seekPoint]);

  useEffect(() => {
    if (!map) return;
    const bearing = seekPoint ? resolvePointBearing(seekPoint, seekIndex, points) : 0;
    // Unlike leaflet-rotate, MapLibre bearings are clockwise from north.
    map.setBearing(headingUp ? bearing : 0);
    if (!seekPoint) return;
    const position: [number, number] = [seekPoint.lng, seekPoint.lat];
    seekMarkerRef.current?.setLngLat(position).setRotation(markerType === "arrow" ? bearing : 0);
    seekPopupRef.current?.setLngLat(position).setHTML(buildTooltipContent(seekPoint, labels));
    if (centerOnMarker) map.jumpTo({ center: position });
  }, [map, seekPoint, seekIndex, points, markerType, centerOnMarker, headingUp, labels]);

  return (
    <div className="absolute inset-0">
      <div ref={containerRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
      <label className="absolute top-28 right-3 z-[400] rounded bg-white dark:bg-gray-800 shadow-md p-2 text-xs text-gray-800 dark:text-gray-100">
        <span className="sr-only">{uiLabels.basemapTitle}</span>
        <select aria-label={uiLabels.basemapTitle} value={basemap}
          onChange={(event) => setBasemap(event.target.value as BasemapId)}
          className="bg-white dark:bg-gray-800 max-w-40">
          <option value="gsi-std">{uiLabels.gsiStd}</option>
          <option value="gsi-pale">{uiLabels.gsiPale}</option>
          <option value="gsi-photo">{uiLabels.gsiPhoto}</option>
          <option value="gsi-blank">{uiLabels.gsiBlank}</option>
          <option value="gsi-vector">{uiLabels.gsiVector}</option>
          <option value="osm">OpenStreetMap</option>
        </select>
      </label>
      {loadError !== null && (
        <div role="alert" className="absolute right-3 top-44 z-[400] max-w-64 rounded bg-red-50 p-3 text-xs text-red-800 shadow">
          {uiLabels.mapLoadError}
          <details className="mt-1"><summary>MapLibre</summary>{loadError}</details>
        </div>
      )}
    </div>
  );
}
