import "leaflet";

declare module "leaflet" {
  interface MapOptions {
    rotate?: boolean;
    bearing?: number;
    rotateControl?: boolean | { position?: ControlPosition; closeOnZeroBearing?: boolean };
  }
  interface Map {
    rotateControl?: Control;
    setBearing(deg: number): this;
    getBearing(): number;
  }
}

declare module "leaflet-rotate" {
  // leaflet-rotate extends Leaflet's Map with rotation support.
  // Importing this module has the side-effect of patching L.Map.
}
