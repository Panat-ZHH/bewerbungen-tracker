import * as THREE from "three";
import { ISLANDS, type IslandConfig } from "./islands-config.ts";
import { rectsOverlap, reservedBridgeRects } from "./islands.ts";
import { mapRenderLayers, setMapRenderLayer } from "./map-renderer.ts";

type Mesh = THREE.Mesh;
/** Drawing helpers owned by the map world (shared geometry/material caches). */
export type SceneryHelpers = {
  box: (parent: THREE.Object3D, x: number, y: number, z: number, width: number, height: number, depth: number, color: string | THREE.Material) => Mesh;
  cylinder: (parent: THREE.Object3D, x: number, y: number, z: number, top: number, bottom: number, height: number, color: string, sides?: number) => Mesh;
  tree: (x: number, z: number, size?: number, pine?: boolean) => void;
};
export type IslandParts = { land: THREE.Group; bridge: THREE.Group | null; ghost: boolean };

const pseudo = (seed: number) => { const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453; return value - Math.floor(value); };

function bridgeDeck(h: SceneryHelpers, group: THREE.Group, island: IslandConfig, ghost: THREE.Material | null) {
  const { bridge, bridgeAxis } = island;
  if (!bridge || !bridgeAxis) return;
  const along = bridgeAxis === "x";
  const length = along ? bridge.x1 - bridge.x0 : bridge.z1 - bridge.z0;
  const width = along ? bridge.z1 - bridge.z0 : bridge.x1 - bridge.x0;
  const cx = (bridge.x0 + bridge.x1) / 2, cz = (bridge.z0 + bridge.z1) / 2;
  const put = (a: number, y: number, b: number, la: number, ly: number, lb: number, color: string) => {
    const [x, z] = along ? [cx + a, cz + b] : [cx + b, cz + a];
    const [w, d] = along ? [la, lb] : [lb, la];
    return h.box(group, x, y, z, w, ly, d, ghost ?? color);
  };
  // Water channel under the bridge.
  setMapRenderLayer(put(0, 0.1, 0, length + 0.1, 0.12, width + 5, "#51a5af"), mapRenderLayers.water);
  put(0, 0.46, 0, length + 0.4, 0.14, width, "#a98356");
  for (let plank = 0; plank < length * 3 + 1; plank++) put(-length / 2 + 0.1 + plank * 0.34, 0.56, 0, 0.24, 0.06, width - 0.1, "#d1b27b");
  for (const side of [-1, 1]) {
    put(0, 1.0, side * (width / 2 - 0.05), length + 0.4, 0.1, 0.1, "#b19768");
    for (let post = 0; post <= length; post++) put(-length / 2 + post, 0.8, side * (width / 2 - 0.05), 0.15, 0.7, 0.15, "#b19768");
    for (const end of [-1, 1]) put(end * (length / 2 - 0.1), 0.18, side * (width / 2 - 0.3), 0.5, 0.9, 0.5, "#a5ad91");
  }
}

export function buildIslands(h: SceneryHelpers, root: THREE.Object3D, unlockedCount: number): Map<number, IslandParts> {
  const parts = new Map<number, IslandParts>();
  for (const island of ISLANDS) {
    if (island.no === 1 || island.no > unlockedCount + 1) continue;
    const ghost = island.no > unlockedCount;
    const ghostMaterial = ghost ? new THREE.MeshStandardMaterial({ color: "#a9c8a0", transparent: true, opacity: 0.34, depthWrite: false }) : null;
    const { x0, z0, x1, z1 } = island.area;
    const land = new THREE.Group();
    root.add(land);
    const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    setMapRenderLayer(h.box(land, cx, -0.65, cz, w, 1.3, d, ghostMaterial ?? "#8d8a6e"), mapRenderLayers.terrain);
    setMapRenderLayer(h.box(land, cx, -0.08, cz, w, 0.45, d, ghostMaterial ?? "#84a66b"), mapRenderLayers.terrain + 1);
    if (!ghost) {
      for (let patch = 0; patch < 14; patch++) {
        const meadow = new THREE.Mesh(new THREE.CircleGeometry(1.6 + (patch % 3) * 0.5, 9), new THREE.MeshStandardMaterial({ color: ["#7fa166", "#8aab71", "#90ae75"][patch % 3], roughness: 0.9 }));
        meadow.position.set(x0 + 2 + pseudo(patch + island.no) * (w - 4), 0.151, z0 + 2 + pseudo(patch * 3 + island.no) * (d - 4));
        meadow.rotation.x = -Math.PI / 2; meadow.scale.y = 0.65; meadow.receiveShadow = true;
        setMapRenderLayer(meadow, mapRenderLayers.terrain + 2);
        land.add(meadow);
      }
      // Trees only along the shore so the whole interior stays free for houses; never on a bridge landing.
      const known = new Set(root.children);
      const shoreTree = (x: number, z: number, size: number, pine: boolean) => {
        const cell = { x0: Math.floor(x) - 1, z0: Math.floor(z) - 1, x1: Math.floor(x) + 2, z1: Math.floor(z) + 2 };
        if (!reservedBridgeRects().some((rect) => rectsOverlap(rect, cell))) h.tree(x, z, size, pine);
      };
      for (let i = 0; i < Math.floor(w / 2.4); i++) for (const edge of [z0 + 0.2, z1 - 0.2]) shoreTree(x0 + 0.9 + i * 2.4 + pseudo(i + edge) * 0.8, edge, 0.7 + pseudo(i * edge) * 0.25, i % 2 === 0);
      for (let i = 0; i < Math.floor(d / 3); i++) for (const edge of [x0 + 0.2, x1 - 0.2]) shoreTree(edge, z0 + 1 + i * 3, 0.7 + pseudo(i + edge) * 0.25, i % 2 === 1);
      for (const child of root.children.filter((child) => !known.has(child))) land.add(child);
      for (let rock = 0; rock < 6; rock++) {
        const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(0.5, 0), new THREE.MeshStandardMaterial({ color: rock % 2 ? "#8c9a7c" : "#a5ad8f", flatShading: true }));
        stone.position.set(x0 + 0.6 + pseudo(rock + 9) * (w - 1.2), 0.3, z1 - 0.6); stone.scale.set(1.2, 0.7, 1.1); stone.castShadow = true;
        land.add(stone);
      }
    }
    const bridge = island.bridge ? new THREE.Group() : null;
    if (bridge) { root.add(bridge); bridgeDeck(h, bridge, island, ghostMaterial); }
    parts.set(island.no, { land, bridge, ghost });
  }
  return parts;
}

/** Rise-from-the-sea animation: returns false when finished. */
export function revealProgress(parts: IslandParts, elapsed: number) {
  const t = Math.min(1, elapsed / 1600);
  const ease = 1 - Math.pow(1 - t, 3);
  const overshoot = t < 1 ? Math.sin(t * Math.PI) * 0.35 : 0;
  parts.land.position.y = -7 * (1 - ease) + overshoot;
  if (parts.bridge) { const b = Math.min(1, Math.max(0, (elapsed - 500) / 1100)); parts.bridge.scale.set(1, 1, 1); parts.bridge.position.y = -4 * Math.pow(1 - b, 3); }
  return t < 1 || elapsed < 1600;
}
