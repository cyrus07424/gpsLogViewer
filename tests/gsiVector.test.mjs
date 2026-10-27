import assert from "node:assert/strict";
import test from "node:test";
import { validateStyleMin } from "@maplibre/maplibre-gl-style-spec";
import { createGsiVectorStyle } from "../app/lib/gsiVector.ts";

test("GSI vector basemap has no raster-embedded labels", () => {
  const style = createGsiVectorStyle();
  assert.ok(Object.values(style.sources).every(source => source.type === "vector"));
  assert.ok(style.layers.every(layer => layer.type !== "raster"));
  assert.deepEqual(validateStyleMin(style), []);
});

test("GSI labels face the viewport at any bearing or pitch", () => {
  const labels = createGsiVectorStyle().layers.filter(layer => layer.type === "symbol");
  assert.ok(labels.length > 0);
  for (const label of labels) {
    assert.equal(label["source-layer"], "label");
    assert.deepEqual(label.layout["text-field"], ["get", "knj"]);
    assert.equal(label.layout["symbol-placement"], "point");
    assert.equal(label.layout["text-rotation-alignment"], "viewport");
    assert.equal(label.layout["text-pitch-alignment"], "viewport");
    assert.equal(label.layout["text-rotate"], 0);
  }
});
