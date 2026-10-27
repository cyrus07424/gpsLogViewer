import type { StyleSpecification, SymbolLayerSpecification } from "maplibre-gl";

export const GSI_VECTOR_TILE_URL = "https://cyberjapandata.gsi.go.jp/xyz/experimental_bvmap/{z}/{x}/{y}.pbf";
export const GSI_VECTOR_ATTRIBUTION =
  '<a href="https://github.com/gsi-cyberjapan/gsimaps-vector-experiment" target="_blank" rel="noreferrer">国土地理院ベクトルタイル提供実験</a>';

export const GSI_LABEL_LAYOUT: SymbolLayerSpecification["layout"] = {
  "text-field": ["get", "knj"],
  "text-font": ["NotoSansCJKjp-Regular"],
  "text-size": 13,
  "symbol-placement": "point",
  "text-rotation-alignment": "viewport",
  "text-pitch-alignment": "viewport",
  "text-rotate": 0,
  "text-allow-overlap": false,
};

export function createGsiVectorStyle(): StyleSpecification {
  return {
    version: 8,
    glyphs: "https://maps.gsi.go.jp/xyz/noto-jp/{fontstack}/{range}.pbf",
    sources: {
      "gsi-vector": {
        type: "vector", tiles: [GSI_VECTOR_TILE_URL],
        minzoom: 4, maxzoom: 16, attribution: GSI_VECTOR_ATTRIBUTION,
      },
    },
    layers: [
      { id: "background", type: "background", paint: { "background-color": "#f8f8f4" } },
      ...["waterarea", "lake", "building"].map((layer) => ({
        id: layer, type: "fill" as const, source: "gsi-vector", "source-layer": layer,
        paint: { "fill-color": layer === "building" ? "#d6d0c8" : "#aad3df", "fill-opacity": 0.7 },
      })),
      ...([["river", "#0ea5e9", 1], ["road", "#808080", 2], ["railway", "#4b5563", 1.5]] as const)
        .map(([layer, color, width]) => ({
          id: layer, type: "line" as const, source: "gsi-vector", "source-layer": layer,
          paint: { "line-color": color, "line-width": width },
        })),
      {
        id: "gsi-labels", type: "symbol", source: "gsi-vector", "source-layer": "label",
        filter: ["has", "knj"], layout: GSI_LABEL_LAYOUT,
        paint: { "text-color": "#333333", "text-halo-color": "#ffffff", "text-halo-width": 1.5 },
      },
    ],
  };
}
