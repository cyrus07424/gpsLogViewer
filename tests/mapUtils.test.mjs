import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTooltipContent, buildTrackGeoJSON, calcBearing, DEFAULT_MAP_LABELS,
  resolvePointBearing, speedColor,
} from "../app/lib/mapUtils.ts";

test("empty and single-point tracks do not create invalid LineStrings", () => {
  for (const colored of [false, true]) {
    assert.deepEqual(buildTrackGeoJSON([], colored).features, []);
    assert.deepEqual(buildTrackGeoJSON([{ lat: 35, lng: 139 }], colored).features, []);
  }
});

test("track GeoJSON uses longitude/latitude coordinates", () => {
  const points = [{ lat: 35, lng: 139 }, { lat: 36, lng: 140 }];
  const data = buildTrackGeoJSON(points, false);
  assert.equal(data.type, "FeatureCollection");
  assert.equal(data.features.length, 1);
  assert.deepEqual(data.features[0].geometry.coordinates, [[139, 35], [140, 36]]);
  assert.equal(data.features[0].properties.color, "#3b82f6");
});

test("speed-colored tracks match Leaflet segment colors", () => {
  const points = [
    { lat: 35, lng: 139, speed: 0 }, { lat: 36, lng: 140, speed: 50 },
    { lat: 37, lng: 141, speed: 100 }, { lat: 38, lng: 142 },
  ];
  const data = buildTrackGeoJSON(points, true);
  assert.deepEqual(data.features.map((feature) => feature.properties.color),
    ["rgb(255,255,0)", "rgb(255,0,0)", "#3b82f6"]);
  assert.deepEqual(data.features[1].geometry.coordinates, [[140, 36], [141, 37]]);
  assert.equal(speedColor(0, 100), "rgb(0,255,0)");
});

test("stationary tracks use the normal color", () => {
  const data = buildTrackGeoJSON([{ lat: 35, lng: 139, speed: 0 }, { lat: 35, lng: 139 }], true);
  assert.equal(data.features.length, 1);
  assert.equal(data.features[0].properties.color, "#3b82f6");
});

test("large GPS logs do not overflow the argument stack", () => {
  const points = Array.from({ length: 150_000 }, (_, i) => ({ lat: 35, lng: 139 + i / 1e6, speed: i % 100 }));
  assert.equal(buildTrackGeoJSON(points, true).features.length, points.length - 1);
});

test("bearings are clockwise from north and prefer the GPS course", () => {
  assert.equal(calcBearing(0, 0, 1, 0), 0);
  assert.equal(calcBearing(0, 0, 0, 1), 90);
  const points = [{ lat: 0, lng: 0 }, { lat: 0, lng: 1 }];
  assert.equal(resolvePointBearing(points[0], 0, points), 90);
  assert.equal(resolvePointBearing(points[1], 1, points), 90);
  assert.equal(resolvePointBearing({ ...points[1], course: 270 }, 1, points), 270);
  assert.equal(resolvePointBearing(points[0], 0, [points[0]]), 0);
});

test("localized tooltips retain zero values and escape HTML", () => {
  const html = buildTooltipContent(
    { lat: 35, lng: 139, speed: 0, altitude: 0, satellites: 0, hdop: 0 },
    { ...DEFAULT_MAP_LABELS, speed: "<speed>" }, "<start>",
  );
  assert.ok(html.includes("<b>&lt;start&gt;</b>"));
  assert.ok(html.includes("&lt;speed&gt;: 0.0 km/h"));
  assert.ok(html.includes("高度: 0.0 m"));
  assert.ok(html.includes("衛星数: 0"));
  assert.ok(html.includes("HDOP: 0.0"));
});
