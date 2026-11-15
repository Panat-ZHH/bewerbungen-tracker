// Burnt-house model: low-poly, flat-shaded, same helpers and plot as the village houses (ground pad 4.3 x 4.2, front = +z).
// Charred broken walls, a collapsed roof with loose rafters, rubble, glowing embers, a small fire and rising smoke.
// Animations only run when motion is allowed (the map loop skips them with prefers-reduced-motion), so the static
// first pose must already read well: flames at rest size, smoke puffs spread along the column.
import * as THREE from "three";
import type { PalaceHelpers } from "./map-palace-model.ts";
import { flameFlicker, smokePhase, smokeScale } from "./map-ruin.ts";

export type RuinOptions = { selected: boolean; seed?: number };

export const RUIN_COLORS = {
  scorched: "#7f7b5c",
  ash: "#9a948a",
  soot: "#3f3834",
  char: "#2e2826",
  wall: "#6d6158",
  plaster: "#a39886",
  beam: "#3a2c24",
  roof: "#4a4442",
  ember: "#e2643a",
  flameRed: "#de5a2e",
  flameOrange: "#f08c3a",
  flameYellow: "#f7c95a",
  smoke: "#55504d",
} as const;

// Shared glowing / translucent materials (cheap, reused by every ruin; three re-uploads them if a world disposes them).
let shared: { ember: THREE.MeshStandardMaterial; flames: THREE.MeshStandardMaterial[]; smoke: THREE.MeshStandardMaterial; hole: THREE.MeshStandardMaterial } | null = null;
function materials() {
  if (shared) return shared;
  const glow = (color: string, intensity: number) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 1, flatShading: true });
  shared = {
    ember: glow(RUIN_COLORS.ember, 0.6),
    flames: [glow(RUIN_COLORS.flameRed, 0.7), glow(RUIN_COLORS.flameOrange, 0.85), glow(RUIN_COLORS.flameYellow, 1)],
    smoke: new THREE.MeshStandardMaterial({ color: RUIN_COLORS.smoke, roughness: 1, transparent: true, opacity: 0.5, depthWrite: false, flatShading: true }),
    // Burnt-out window holes keep a faint ember glow inside.
    hole: new THREE.MeshStandardMaterial({ color: "#2a1f1b", emissive: "#a8401f", emissiveIntensity: 0.35, roughness: 1 }),
  };
  return shared;
}

/** Builds the ruin into `group` and returns per-frame animations (flame flicker, ember pulse, rising smoke). */
export function buildRuin(h: PalaceHelpers, group: THREE.Object3D, options: RuinOptions): ((time: number) => void)[] {
  const { box, mesh } = h;
  const c = RUIN_COLORS;
  const m = materials();
  const seed = options.seed ?? 0;
  const animations: ((time: number) => void)[] = [];
  const noShadow = (object: THREE.Mesh) => { object.castShadow = false; object.receiveShadow = false; return object; };

  // Ground: scorched lawn, ash footprint, the old foundation slab and burnt fence stumps.
  box(group, 0, 0.12, 0, 4.3, 0.24, 4.2, options.selected ? "#e8c878" : c.scorched);
  box(group, 0, 0.255, 0, 3.4, 0.03, 3.3, c.ash);
  box(group, 0, 0.3, 0, 2.6, 0.1, 2.55, "#8a8378");
  box(group, 0, 0.35, 1.5, 0.9, 0.08, 0.55, "#b5aa96");
  for (const side of [-1, 1]) {
    for (const [post, height] of [[-1, 0.5], [0, 0.22], [1, 0.38]] as const) box(group, side * 1.92, 0.24 + height / 2, post * 1.2, 0.13, height, 0.13, c.beam);
    const rail = box(group, side * 1.92, 0.42, -0.55, 0.1, 0.1, 1.3, c.soot);
    rail.rotation.x = side * 0.18;
  }

  // Broken walls: back wall highest, side walls jagged, front wall mostly gone. Stacked blocks of uneven height = broken top.
  const wallY = 0.35;
  const jagged = (x: number, z: number, along: "x" | "z", heights: number[], width: number) => {
    heights.forEach((height, index) => {
      const offset = (index - (heights.length - 1) / 2) * width;
      const color = index % 3 === 1 ? c.plaster : index % 2 ? c.soot : c.wall;
      if (along === "x") box(group, x + offset, wallY + height / 2, z, width, height, 0.16, color);
      else box(group, x, wallY + height / 2, z + offset, 0.16, height, width, color);
    });
  };
  jagged(0, -1.08, "x", [1.15, 1.55, 1.3, 0.9, 1.45, 0.7], 0.39);
  jagged(-1.12, 0, "z", [0.55, 0.95, 1.25, 0.8, 1.1, 0.45], 0.37);
  jagged(1.12, 0, "z", [0.35, 0.7, 1.05, 1.35, 0.6, 0.85], 0.37);
  jagged(0, 1.08, "x", [0.75, 0.4, 0, 0, 0.5, 0.9], 0.39);
  // Burnt-out window holes with a faint ember glow, soot streaks above them.
  for (const windowX of [-0.55, 0.55]) {
    box(group, windowX, wallY + 0.75, -0.99, 0.36, 0.34, 0.04, m.hole);
    box(group, windowX, wallY + 1.02, -0.99, 0.3, 0.16, 0.03, c.char);
  }
  for (const windowZ of [-0.4, 0.35]) box(group, -1.03, wallY + 0.65, windowZ, 0.04, 0.32, 0.32, m.hole);
  box(group, 1.03, wallY + 0.7, -0.1, 0.04, 0.3, 0.3, m.hole);
  // Corner posts, charred and of different heights.
  for (const [cornerX, cornerZ, height] of [[-1.12, -1.08, 1.7], [1.12, -1.08, 1.5], [-1.12, 1.08, 0.95], [1.12, 1.08, 1.2]] as const) box(group, cornerX, wallY + height / 2, cornerZ, 0.18, height, 0.18, c.char);
  // Chimney still standing, top broken off.
  box(group, 0.7, wallY + 1.05, -0.6, 0.32, 2.1, 0.36, "#5d534d");
  box(group, 0.62, wallY + 2.15, -0.6, 0.18, 0.12, 0.36, "#5d534d");

  // Collapsed roof: two slabs fell into the house, one still leaning on the back wall; loose rafters stick out.
  const slabBack = box(group, -0.15, wallY + 0.95, -0.45, 2.2, 0.1, 1.2, c.roof);
  slabBack.rotation.set(0.55, 0.06, 0.08);
  const slabFront = box(group, 0.2, wallY + 0.35, 0.45, 1.9, 0.1, 1.1, c.roof);
  slabFront.rotation.set(-0.22, -0.1, -0.12);
  for (const [x, y, z, rx, rz] of [[-0.6, 1.1, -0.2, 0.7, 0.2], [0.1, 1.2, -0.1, 0.9, -0.15], [0.75, 0.75, 0.3, -0.5, 0.4], [-0.3, 0.6, 0.65, 0.2, -0.6]] as const) {
    const rafter = box(group, x, wallY + y, z, 0.08, 0.08, 1.7, c.beam);
    rafter.rotation.set(rx, 0, rz);
  }
  const ridge = box(group, -0.1, wallY + 1.3, -0.5, 2.4, 0.12, 0.12, c.beam);
  ridge.rotation.z = -0.32;

  // Rubble and a few roof tiles in front of the house.
  const rubble: [number, number, number, number, string][] = [[-0.6, 1.35, 0.3, 0.4, "#6d6158"], [0.55, 1.45, 0.24, 1.1, "#5d534d"], [-0.15, 1.75, 0.2, 0.2, c.roof], [1.45, 0.7, 0.28, 0.8, c.wall], [-1.45, -0.6, 0.22, 2, c.plaster], [0.95, 1.15, 0.18, 2.6, c.roof]];
  for (const [x, z, size, rotation, color] of rubble) box(group, x, 0.3 + size / 2, z, size * 1.4, size, size, color).rotation.y = rotation;

  // Embers: glowing chunks inside the ruin (pulse gently).
  const embers = [[-0.5, 0.45, 0.1], [0.4, 0.45, -0.3], [0.05, 0.42, 0.55], [-0.75, 0.43, -0.55]];
  for (const [x, y, z] of embers) noShadow(box(group, x, y, z, 0.26, 0.12, 0.2, m.ember));
  animations.push((time) => { m.ember.emissiveIntensity = 0.55 + Math.sin(time * 2.3) * 0.2 + Math.sin(time * 5.9) * 0.08; });

  // Flames: layered low-poly cones (red outside, yellow core) in three spots; they flicker in height and sway.
  const fires: [number, number, number][] = [[-0.45, 0.5, 0.05], [0.4, 0.75, -0.45], [0.15, 0.4, 0.6]];
  fires.forEach(([fx, scale, fz], fireIndex) => {
    const fire = new THREE.Group();
    fire.position.set(fx, wallY + 0.12, fz);
    fire.scale.setScalar(scale + 0.6);
    group.add(fire);
    const layers: THREE.Mesh[] = [];
    [[0.32, 0.9, 0], [0.22, 0.7, 1], [0.12, 0.45, 2]].forEach(([radius, height, layer], index) => {
      const flame = noShadow(mesh(fire, `ruin-flame-${index}`, () => new THREE.ConeGeometry(radius, height, 6), m.flames[layer], 0, height / 2, 0));
      flame.rotation.y = index * 0.5;
      layers.push(flame);
    });
    // Two small side tongues.
    for (const side of [-1, 1]) {
      const tongue = noShadow(mesh(fire, "ruin-flame-tongue", () => new THREE.ConeGeometry(0.1, 0.42, 5), m.flames[1], side * 0.2, 0.2, side * 0.05));
      tongue.rotation.z = side * -0.35;
      layers.push(tongue);
    }
    const flameSeed = seed + fireIndex * 2.3;
    animations.push((time) => {
      layers.forEach((flame, index) => {
        const flicker = flameFlicker(time, flameSeed + index);
        flame.scale.set(1 + (flicker - 1) * 0.4, flicker, 1 + (flicker - 1) * 0.4);
      });
      fire.rotation.z = Math.sin(time * 3.2 + flameSeed) * 0.06;
    });
  });

  // Smoke: two columns of soft grey puffs rising, drifting with the wind and thinning out at the top.
  const columns: [number, number, number][] = [[0.4, 0.75 + wallY + 0.9, -0.45], [-0.45, wallY + 0.9, 0.05]];
  columns.forEach(([cx, baseY, cz], columnIndex) => {
    const puffs: THREE.Mesh[] = [];
    for (let index = 0; index < 5; index++) puffs.push(noShadow(mesh(group, "ruin-smoke", () => new THREE.IcosahedronGeometry(0.32, 0), m.smoke, cx, baseY, cz)));
    const place = (time: number) => {
      puffs.forEach((puff, index) => {
        const phase = smokePhase(time, index / puffs.length + columnIndex * 0.13, 4.5 + columnIndex);
        puff.position.set(cx + phase * 0.9 + Math.sin(time * 0.9 + index) * 0.08, baseY + phase * 2.6, cz - phase * 0.35);
        puff.scale.setScalar(smokeScale(phase) * (columnIndex ? 0.8 : 1));
        puff.rotation.y = phase * 2 + index;
      });
    };
    place(seed);
    animations.push(place);
  });
  return animations;
}
