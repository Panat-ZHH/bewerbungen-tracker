import assert from "node:assert/strict";
import { test } from "node:test";
import * as THREE from "three";
import { Projector } from "three/addons/renderers/Projector.js";
import { getMapWebGLContext, mapRenderLayers, setMapRenderLayer } from "../lib/map-renderer.ts";

test("disabled or throwing WebGL contexts select the fallback without constructing a renderer", () => {
  assert.equal(getMapWebGLContext({ getContext: () => null }), null);
  assert.equal(getMapWebGLContext({ getContext: () => { throw new Error("GPU disabled"); } }), null);
  assert.equal(getMapWebGLContext({ getContext: () => ({ isContextLost: () => true }) }), null);
});

test("a working WebGL2 context is reused rather than creating a second context", () => {
  const context = { isContextLost: () => false };
  let calls = 0;
  assert.equal(getMapWebGLContext({ getContext: (type) => { calls++; assert.equal(type, "webgl2"); return context; } }), context);
  assert.equal(calls, 1);
});

test("SVG painter ordering draws large terrain before water, roads, grid and buildings", () => {
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-16, 16, 12, -12, 0.1, 200);
  camera.position.set(24, 30, 34); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
  const layers = [mapRenderLayers.terrain, mapRenderLayers.water, mapRenderLayers.road, mapRenderLayers.grid, mapRenderLayers.object];
  const geometries = [];
  const material = new THREE.MeshBasicMaterial();
  try {
    for (const [index, layer] of layers.entries()) {
      const group = new THREE.Group();
      const geometry = new THREE.BoxGeometry(index === 0 ? 34 : 3, index === 4 ? 4 : 0.1, index === 0 ? 31 : 3);
      geometries.push(geometry);
      const mesh = new THREE.Mesh(geometry, material); mesh.position.y = index * 0.25;
      group.add(mesh); setMapRenderLayer(group, layer); scene.add(group);
      assert.equal(mesh.renderOrder, layer);
    }
    const elements = new Projector().projectScene(scene, camera, true, true).elements;
    assert.ok(elements.length > 10);
    for (let index = 1; index < elements.length; index++) assert.ok(elements[index].renderOrder >= elements[index - 1].renderOrder);
    assert.equal(elements[0].renderOrder, mapRenderLayers.terrain);
    assert.equal(elements.at(-1).renderOrder, mapRenderLayers.object);
  } finally { geometries.forEach((geometry) => geometry.dispose()); material.dispose(); }
});
test("pixel ratio is capped at 1.5 and never below 1", async () => {
  const { basePixelRatio, MAX_PIXEL_RATIO } = await import("../lib/map-renderer.ts");
  assert.equal(MAX_PIXEL_RATIO, 1.5);
  assert.equal(basePixelRatio(3), 1.5); assert.equal(basePixelRatio(2), 1.5); assert.equal(basePixelRatio(1.25), 1.25);
  assert.equal(basePixelRatio(1), 1); assert.equal(basePixelRatio(0.5), 1); assert.equal(basePixelRatio(NaN), 1);
});

test("adaptive resolution: drops after a run of slow frames, recovers slowly, stays inside [1, ceiling]", async () => {
  const { nextPixelRatio } = await import("../lib/map-renderer.ts");
  assert.equal(nextPixelRatio(1.5, 1.5, 40, 12, 0), 1.25, "slow run -> step down");
  assert.equal(nextPixelRatio(1.5, 1.5, 40, 3, 0), 1.5, "a few slow frames are tolerated");
  assert.equal(nextPixelRatio(1, 1.5, 80, 99, 0), 1, "never below 1");
  assert.equal(nextPixelRatio(1, 1.5, 12, 0, 179), 1, "recovery needs a long fast run");
  assert.equal(nextPixelRatio(1, 1.5, 12, 0, 180), 1.25);
  assert.equal(nextPixelRatio(1.5, 1.5, 12, 0, 999), 1.5, "never above the ceiling");
  assert.equal(nextPixelRatio(1.25, 1.5, 20, 99, 99), 1.25, "medium frames: hold");
});

test("shadow refresh policy: on scene change, when the light moved, or every ~120 ms, but not every frame", async () => {
  const { shadowDue } = await import("../lib/map-renderer.ts");
  assert.equal(shadowDue(1016, 1000, 0, false), false);
  assert.equal(shadowDue(1016, 1000, 0, true), true);
  assert.equal(shadowDue(1016, 1000, 5, false), true);
  assert.equal(shadowDue(1130, 1000, 0, false), true);
  const refreshed = Array.from({ length: 60 }, (_, frame) => frame).filter((frame) => shadowDue(frame * 16, 0, 0, false)).length;
  assert.ok(refreshed >= 1);
});
