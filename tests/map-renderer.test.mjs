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