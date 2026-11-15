// Palace model (shop-v2): low-poly, flat-shaded, pastel – same style and helpers as the houses in the village map.
// Fits the 5x5 house plot (ground pad 4.3 x 4.2, centred on the group origin, front = +z).
import * as THREE from "three";
import { palaceRiseProgress } from "./map-palace.ts";

type Mesh = THREE.Mesh;
/** Drawing helpers owned by the map world (shared geometry/material caches). */
export type PalaceHelpers = {
  box: (parent: THREE.Object3D, x: number, y: number, z: number, width: number, height: number, depth: number, color: string | THREE.Material) => Mesh;
  cylinder: (parent: THREE.Object3D, x: number, y: number, z: number, top: number, bottom: number, height: number, color: string, sides?: number) => Mesh;
  mesh: (parent: THREE.Object3D, shape: string, geometry: () => THREE.BufferGeometry, color: string | THREE.Material, x: number, y: number, z: number) => Mesh;
  windowMaterial: THREE.Material;
};

export type PalaceOptions = {
  selected: boolean;
  /** performance.now() timestamp when the celebration rise started; null = static palace. */
  riseStart: number | null;
};

export const PALACE_COLORS = {
  wall: "#f3e6c7",
  trim: "#dcc390",
  gold: "#e9b949",
  coral: "#e3876f",
  roof: "#7fa7b5",
  hedge: "#5f8f4e",
  lawn: "#91a36b",
  path: "#e4d6b3",
  water: "#6aaeb2",
} as const;

/** Builds the palace into `group` and returns the per-frame animations (flags, fountain, celebration rise + sparkles). */
export function buildPalace(h: PalaceHelpers, group: THREE.Object3D, options: PalaceOptions): ((time: number) => void)[] {
  const { box, cylinder, mesh, windowMaterial } = h;
  const c = PALACE_COLORS;
  const animations: ((time: number) => void)[] = [];

  // Ground: lawn pad, garden path and low hedges (static, never rises).
  box(group, 0, 0.12, 0, 4.3, 0.24, 4.2, options.selected ? "#e8c878" : c.lawn);
  box(group, 0, 0.26, 1.45, 0.8, 0.06, 1.3, c.path);
  box(group, 0, 0.26, -0.35, 3.3, 0.06, 2.3, "#d8ccad");
  for (const side of [-1, 1]) {
    box(group, side * 1.35, 0.36, 1.9, 1.15, 0.26, 0.24, c.hedge);
    box(group, side * 1.95, 0.36, 0.85, 0.24, 0.26, 1.9, c.hedge);
  }
  // Flower bed (left) and a little fountain (right) in the front garden.
  box(group, -1.25, 0.3, 1.3, 0.8, 0.14, 0.6, "#9e7b5c");
  box(group, -1.25, 0.39, 1.3, 0.72, 0.06, 0.52, "#86a061");
  for (let flower = 0; flower < 4; flower++) cylinder(group, -1.52 + flower * 0.18, 0.46, 1.3 + (flower % 2 ? 0.12 : -0.1), 0.06, 0.06, 0.08, ["#d69292", "#ebcd84", "#f0a58f", "#c9a3d6"][flower], 6);
  cylinder(group, 1.25, 0.32, 1.3, 0.42, 0.45, 0.18, "#cfcab0", 10);
  cylinder(group, 1.25, 0.42, 1.3, 0.34, 0.34, 0.04, c.water, 10);
  cylinder(group, 1.25, 0.55, 1.3, 0.05, 0.07, 0.3, "#dcd8c0", 6);
  const jet = cylinder(group, 1.25, 0.8, 1.3, 0.02, 0.05, 0.25, "#c1dfd5", 6);
  animations.push((time) => { jet.scale.y = 1 + Math.sin(time * 3.1) * 0.2; });

  // Everything that "rises" during the celebration lives in `body`.
  const body = new THREE.Group();
  group.add(body);
  const base = 0.29;

  // Main hall with plinth, cornice and battlements.
  box(body, 0, base + 0.08, -0.35, 2.7, 0.16, 2.0, c.trim);
  box(body, 0, base + 0.86, -0.35, 2.5, 1.4, 1.8, c.wall);
  box(body, 0, base + 1.6, -0.35, 2.62, 0.1, 1.92, c.trim);
  for (let merlon = 0; merlon < 6; merlon++) {
    box(body, -1.15 + merlon * 0.46, base + 1.74, 0.55, 0.2, 0.18, 0.12, c.wall);
    box(body, -1.15 + merlon * 0.46, base + 1.74, -1.25, 0.2, 0.18, 0.12, c.wall);
  }
  // Arched windows on the front (two rows) and the sides.
  for (const row of [0.62, 1.2]) for (const windowX of [-0.8, 0.8]) {
    box(body, windowX, base + row, 0.56, 0.36, 0.4, 0.06, windowMaterial);
    const arch = cylinder(body, windowX, base + row + 0.2, 0.56, 0.18, 0.18, 0.06, "#acd7d2", 8);
    arch.rotation.x = Math.PI / 2;
    box(body, windowX, base + row - 0.23, 0.6, 0.46, 0.05, 0.08, c.trim);
  }
  for (const side of [-1, 1]) for (const windowZ of [-0.85, 0.15]) box(body, side * 1.26, base + 0.95, windowZ, 0.05, 0.42, 0.32, windowMaterial);

  // Gate: porch with columns, arched door and a gold pediment.
  box(body, 0, base + 0.05, 0.85, 1.1, 0.1, 0.6, c.trim);
  for (const side of [-1, 1]) cylinder(body, side * 0.42, base + 0.55, 0.98, 0.07, 0.08, 0.9, c.wall, 8);
  box(body, 0, base + 1.05, 0.85, 1.1, 0.12, 0.62, c.trim);
  const pediment = cylinder(body, 0, base + 1.18, 0.85, 0, 0.62, 0.3, c.gold, 3);
  pediment.rotation.y = Math.PI / 2; pediment.scale.z = 0.95;
  box(body, 0, base + 0.42, 0.57, 0.42, 0.66, 0.06, "#7c5a43");
  const doorArch = cylinder(body, 0, base + 0.75, 0.57, 0.21, 0.21, 0.06, "#7c5a43", 8);
  doorArch.rotation.x = Math.PI / 2;
  cylinder(body, 0.1, base + 0.42, 0.62, 0.03, 0.03, 0.04, c.gold).rotation.x = Math.PI / 2;

  // Upper storey with the big golden dome and the crown on top.
  box(body, 0, base + 1.98, -0.45, 1.3, 0.62, 1.1, c.wall);
  box(body, 0, base + 2.32, -0.45, 1.4, 0.08, 1.2, c.trim);
  for (const windowX of [-0.35, 0.35]) box(body, windowX, base + 2.0, 0.11, 0.24, 0.32, 0.04, windowMaterial);
  cylinder(body, 0, base + 2.45, -0.45, 0.5, 0.52, 0.18, c.trim, 10);
  mesh(body, "palace-dome-large", () => new THREE.SphereGeometry(0.5, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), c.gold, 0, base + 2.54, -0.45);
  // Crown: gold band, five points, coral gem.
  const crownY = base + 3.12;
  cylinder(body, 0, crownY, -0.45, 0.2, 0.18, 0.12, c.gold, 10);
  for (let point = 0; point < 5; point++) {
    const angle = point / 5 * Math.PI * 2;
    cylinder(body, Math.cos(angle) * 0.16, crownY + 0.13, -0.45 + Math.sin(angle) * 0.16, 0, 0.05, 0.16, c.gold, 4);
  }
  mesh(body, "palace-gem", () => new THREE.OctahedronGeometry(0.07, 0), c.coral, 0, crownY + 0.14, -0.45);
  cylinder(body, 0, crownY - 0.18, -0.45, 0.04, 0.06, 0.25, c.gold, 6);

  // Four corner towers with coral onion domes and gold spires; the front two carry waving flags.
  const towers: [number, number, boolean][] = [[-1.35, 0.5, true], [1.35, 0.5, true], [-1.35, -1.2, false], [1.35, -1.2, false]];
  for (const [towerX, towerZ, front] of towers) {
    const towerHeight = front ? 2.15 : 2.45;
    cylinder(body, towerX, base + towerHeight / 2, towerZ, 0.3, 0.34, towerHeight, c.wall, 8);
    cylinder(body, towerX, base + towerHeight + 0.05, towerZ, 0.36, 0.33, 0.12, c.trim, 8);
    box(body, towerX, base + towerHeight * 0.62, towerZ + (towerZ > 0 ? 0.31 : -0.31), 0.14, 0.26, 0.04, windowMaterial);
    const onion = mesh(body, "palace-onion", () => new THREE.SphereGeometry(0.3, 8, 6), c.coral, towerX, base + towerHeight + 0.32, towerZ);
    onion.scale.y = 1.15;
    cylinder(body, towerX, base + towerHeight + 0.7, towerZ, 0, 0.12, 0.34, c.gold, 6);
    if (front) {
      const poleY = base + towerHeight + 1.05;
      cylinder(body, towerX, poleY, towerZ, 0.02, 0.02, 0.6, "#e9dcba", 4);
      const flag = new THREE.Group();
      flag.position.set(towerX, poleY + 0.18, towerZ);
      body.add(flag);
      box(flag, 0.2, 0, 0, 0.38, 0.22, 0.03, towerX < 0 ? c.coral : c.gold);
      const phase = towerX;
      animations.push((time) => { flag.rotation.y = Math.sin(time * 2 + phase) * 0.22; });
    }
  }

  // Celebration: the body grows out of the ground with sparkles circling it for PALACE_RISE_MS.
  if (options.riseStart !== null) {
    const start = options.riseStart;
    const sparkles = new THREE.Group();
    group.add(sparkles);
    const pieces: Mesh[] = [];
    for (let index = 0; index < 10; index++) pieces.push(mesh(sparkles, "palace-sparkle", () => new THREE.OctahedronGeometry(0.12, 0), index % 3 ? c.gold : "#fff2c4", 0, 0, 0));
    for (const piece of pieces) piece.castShadow = false;
    const apply = (progress: number, seconds: number) => {
      body.scale.set(0.6 + progress * 0.4, Math.max(0.02, progress), 0.6 + progress * 0.4);
      sparkles.visible = progress < 1;
      pieces.forEach((piece, index) => {
        const angle = index / pieces.length * Math.PI * 2 + seconds * 3;
        const radius = 1.6 + Math.sin(index * 1.7) * 0.4;
        piece.position.set(Math.cos(angle) * radius, 0.5 + progress * 3 + Math.sin(seconds * 6 + index) * 0.25, Math.sin(angle) * radius);
        piece.rotation.y = seconds * 4 + index;
        piece.scale.setScalar(1 - progress * 0.6);
      });
    };
    apply(palaceRiseProgress(performance.now() - start), performance.now() / 1000);
    animations.push((time) => {
      if (!sparkles.visible && body.scale.y === 1) return;
      apply(palaceRiseProgress(time * 1000 - start), time);
    });
  }
  return animations;
}
