// Single source of truth for islands. Mirrored 1:1 in supabase/migrations/20261104000002_islands.sql
// (table map_island_catalog) - change both together.
//
// Points: every submitted application earns 100 points (see lib/map-shop.ts APPLICATION_REWARD).
// Island 2 = 6 applications, island 3 = 15, island 4 = 30. The first island is free.
// Coordinates are world grid cells shared with the first island (x east, z south); rects are [x0, x1) x [z0, z1).

export type Rect = { x0: number; z0: number; x1: number; z1: number };
export type IslandConfig = {
  no: number;
  name: string;
  price: number;
  /** Walkable/buildable land. Island 1 has a variable depth (z1 follows the village size) and is handled in lib/islands.ts. */
  area: Rect;
  /** Fixed bridge from the previous island (null for island 1). No object may overlap the bridge or its landings. */
  bridge: Rect | null;
  /** Direction the bridge crosses; decides which sides get a landing strip. */
  bridgeAxis: "x" | "z" | null;
  /** Camera focus (grid cells) when switching to this island. */
  focus: { x: number; z: number };
};

export const ISLANDS: readonly IslandConfig[] = [
  { no: 1, name: "Heimatinsel", price: 0, area: { x0: -10, z0: -7, x1: 33, z1: 20 }, bridge: null, bridgeAxis: null, focus: { x: 3, z: 6 } },
  { no: 2, name: "Ostinsel", price: 600, area: { x0: 38, z0: -7, x1: 64, z1: 21 }, bridge: { x0: 33, z0: 8, x1: 38, z1: 11 }, bridgeAxis: "x", focus: { x: 51, z: 7 } },
  { no: 3, name: "Südinsel", price: 1500, area: { x0: 38, z0: 27, x1: 64, z1: 55 }, bridge: { x0: 49, z0: 21, x1: 52, z1: 27 }, bridgeAxis: "z", focus: { x: 51, z: 41 } },
  { no: 4, name: "Gipfelinsel", price: 3000, area: { x0: 70, z0: 27, x1: 96, z1: 55 }, bridge: { x0: 64, z0: 38, x1: 70, z1: 41 }, bridgeAxis: "x", focus: { x: 83, z: 41 } },
] as const;

/** Cells of every island next to a bridge that stay free so the bridge stays reachable. */
export const BRIDGE_LANDING_DEPTH = 2;
