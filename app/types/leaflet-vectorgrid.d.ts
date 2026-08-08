import "leaflet";

declare module "leaflet" {
  interface VectorGridStyle {
    color?: string;
    weight?: number;
    opacity?: number;
    fillColor?: string;
    fillOpacity?: number;
    fill?: boolean;
  }

  interface VectorGridOptions {
    attribution?: string;
    rendererFactory?: typeof L.canvas.tile;
    vectorTileLayerStyles?: Record<string, VectorGridStyle | VectorGridStyle[]>;
  }

  namespace canvas {
    function tile(options?: RendererOptions): Canvas;
  }

  namespace vectorGrid {
    function protobuf(url: string, options?: VectorGridOptions): Layer;
  }
}

declare module "leaflet.vectorgrid" {
  export {};
}
