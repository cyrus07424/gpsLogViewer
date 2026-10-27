import L from "leaflet";
import { VectorTile } from "@mapbox/vector-tile";
import Pbf from "pbf";
import { GSI_VECTOR_TILE_URL } from "../lib/gsiVector";

interface LabelTile {
  controller: AbortController;
  markers: L.Marker[];
}

/** Tile lifecycle controls screen-aligned DOM labels instead of rotating raster text. */
export class GsiLabelLayer extends L.GridLayer {
  private labelTiles = new Map<HTMLElement, LabelTile>();

  constructor() {
    super({ minZoom: 4, maxNativeZoom: 16, maxZoom: 22, keepBuffer: 0 });
    this.on("tileunload", (event: L.TileEvent) => this.removeLabelTile(event.tile));
    this.on("tileerror", (event: L.TileErrorEvent) => {
      console.error("GSI vector labels could not be loaded:", event.error);
    });
  }

  createTile(coords: L.Coords, done: L.DoneCallback): HTMLElement {
    const tile = document.createElement("div");
    const state: LabelTile = { controller: new AbortController(), markers: [] };
    this.labelTiles.set(tile, state);
    const url = L.Util.template(GSI_VECTOR_TILE_URL, coords);
    fetch(url, { signal: state.controller.signal })
      .then(async (response) => {
        // GSI returns 404 for tiles outside the coverage area.
        if (response.status === 404) return null;
        if (!response.ok) throw new Error(`GSI label tile: HTTP ${response.status}`);
        return new VectorTile(new Pbf(new Uint8Array(await response.arrayBuffer())));
      })
      .then((data) => {
        if (state.controller.signal.aborted) return;
        const layer = data?.layers.label;
        if (layer && this._map) {
          for (let i = 0; i < layer.length; i++) {
            const feature = layer.feature(i);
            const text = feature.properties.knj;
            if (feature.type !== 1 || typeof text !== "string" || text.length === 0) continue;
            const geometry = feature.loadGeometry()[0]?.[0];
            // Buffered features belong to the neighboring tile.
            if (!geometry || geometry.x < 0 || geometry.y < 0 ||
              geometry.x >= layer.extent || geometry.y >= layer.extent) continue;
            const geojson = feature.toGeoJSON(coords.x, coords.y, coords.z);
            if (geojson.geometry.type !== "Point") continue;
            const [lng, lat] = geojson.geometry.coordinates;
            const content = document.createElement("span");
            content.textContent = text;
            const marker = L.marker([lat, lng], {
              interactive: false, keyboard: false, pane: "gsiLabelPane",
              icon: L.divIcon({
                html: content, className: "gsi-vector-label",
                iconSize: [0, 0], iconAnchor: [0, 0],
              }),
            }).addTo(this._map);
            state.markers.push(marker);
          }
        }
        done(undefined, tile);
      })
      .catch((error: unknown) => {
        if (state.controller.signal.aborted) return;
        done(error instanceof Error ? error : new Error(String(error)), tile);
      });
    return tile;
  }

  onAdd(map: L.Map): this {
    if (!map.getPane("gsiLabelPane")) {
      const pane = map.createPane("gsiLabelPane", map.getPane("markerPane")!.parentElement!);
      pane.style.zIndex = "450";
      pane.style.pointerEvents = "none";
    }
    return super.onAdd(map);
  }

  onRemove(map: L.Map): this {
    for (const tile of this.labelTiles.keys()) this.removeLabelTile(tile);
    return super.onRemove(map);
  }

  private removeLabelTile(tile: HTMLElement): void {
    const state = this.labelTiles.get(tile);
    if (!state) return;
    state.controller.abort();
    for (const marker of state.markers) marker.remove();
    this.labelTiles.delete(tile);
  }
}
