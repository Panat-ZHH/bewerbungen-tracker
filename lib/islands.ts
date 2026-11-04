import { BRIDGE_LANDING_DEPTH, ISLANDS, type IslandConfig, type Rect } from "./islands-config.ts";

export const FIRST_ISLAND_DEPTH = 20;

export function islandConfig(no: number): IslandConfig | undefined {
  return ISLANDS.find((island) => island.no === no);
}

export const islandCost = (no: number) => islandConfig(no)?.price ?? Infinity;

/** The next locked island (consecutive unlocks), or null when all are unlocked. */
export function nextIsland(unlockedCount: number): IslandConfig | null {
  return ISLANDS.find((island) => island.no === unlockedCount + 1) ?? null;
}

export function clampUnlocked(count: number) {
  return Number.isFinite(count) ? Math.min(ISLANDS.length, Math.max(1, Math.floor(count))) : 1;
}

export function canUnlockIsland(unlockedCount: number, balance: number) {
  const next = nextIsland(clampUnlocked(unlockedCount));
  return next !== null && Number.isFinite(balance) && balance >= next.price;
}

/** Progress toward the next island: points owned (capped) and in percent. */
export function unlockProgress(unlockedCount: number, balance: number) {
  const next = nextIsland(clampUnlocked(unlockedCount));
  if (!next) return null;
  const points = Math.max(0, Math.min(Math.floor(balance) || 0, next.price));
  return { island: next, points, price: next.price, percent: Math.round((points / next.price) * 100), missing: next.price - points };
}

/** Land of one island; the first island is as deep as the village (maxZ). */
export function islandArea(island: IslandConfig, firstIslandDepth = FIRST_ISLAND_DEPTH): Rect {
  return island.no === 1 ? { ...island.area, z1: Math.max(island.area.z1, firstIslandDepth) } : island.area;
}

export function unlockedAreas(unlockedCount: number, firstIslandDepth = FIRST_ISLAND_DEPTH): Rect[] {
  return ISLANDS.filter((island) => island.no <= clampUnlocked(unlockedCount)).map((island) => islandArea(island, firstIslandDepth));
}

/** Bridge plus the landing strips on both ends, for every island (also locked ones, so the way stays free). */
export function reservedBridgeRects(): Rect[] {
  const rects: Rect[] = [];
  for (const { bridge, bridgeAxis } of ISLANDS) {
    if (!bridge || !bridgeAxis) continue;
    const d = BRIDGE_LANDING_DEPTH;
    rects.push(bridgeAxis === "x" ? { ...bridge, x0: bridge.x0 - d, x1: bridge.x1 + d } : { ...bridge, z0: bridge.z0 - d, z1: bridge.z1 + d });
  }
  return rects;
}

export function rectsOverlap(a: Rect, b: Rect) {
  return a.x0 < b.x1 && a.x1 > b.x0 && a.z0 < b.z1 && a.z1 > b.z0;
}

const inside = (area: Rect, rect: Rect) => rect.x0 >= area.x0 && rect.x1 <= area.x1 && rect.z0 >= area.z0 && rect.z1 <= area.z1;

/** Footprint must lie completely on ONE unlocked island and must not touch a bridge/landing. */
export function isPlaceableArea(x: number, z: number, width: number, depth: number, unlockedCount = 1, firstIslandDepth = FIRST_ISLAND_DEPTH) {
  const rect = { x0: x, z0: z, x1: x + width, z1: z + depth };
  return unlockedAreas(unlockedCount, firstIslandDepth).some((area) => inside(area, rect)) && !reservedBridgeRects().some((bridge) => rectsOverlap(bridge, rect));
}

/** Which island (number) a world cell belongs to, or null (water/bridge). */
export function islandAt(x: number, z: number, unlockedCount = 1, firstIslandDepth = FIRST_ISLAND_DEPTH): number | null {
  const found = ISLANDS.find((island) => island.no <= clampUnlocked(unlockedCount) && inside(islandArea(island, firstIslandDepth), { x0: x, z0: z, x1: x + 1, z1: z + 1 }));
  return found?.no ?? null;
}

export type IslandsState = { unlocked: number };
