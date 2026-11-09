import { isPlaceableArea } from "./islands.ts";
import { canPlaceMapItem, isLockedMapObject, itemFootprint, type MapPosition, type MapShopState, type OwnedMapItem, type PlaceableItem } from "./map-shop.ts";

export type DropVerdict = { valid: boolean; reason: "ok" | "locked" | "bounds" | "water" | "street" | "overlap" };

export const dropMessages: Record<DropVerdict["reason"], string> = {
  ok: "",
  locked: "Strassen und Brücken sind fest und lassen sich nicht verschieben.",
  bounds: "Ausserhalb der Insel – der Gegenstand ist zurückgesprungen.",
  water: "Hier ist Wasser – der Gegenstand ist zurückgesprungen.",
  street: "Auf einer Strasse ist kein Platz – der Gegenstand ist zurückgesprungen.",
  overlap: "Dieser Platz ist belegt – der Gegenstand ist zurückgesprungen.",
};

/** Cell under the pointer minus the grab offset: the item keeps the spot where it was picked up (grid snap = whole cells). */
export function snapDragPosition(point: { x: number; z: number }, grab: { x: number; z: number }, rotation: number): MapPosition {
  return { x: Math.floor(point.x) - grab.x, z: Math.floor(point.z) - grab.z, rotation };
}

export function grabOffset(point: { x: number; z: number }, origin: { x: number; z: number }) {
  return { x: Math.floor(point.x) - origin.x, z: Math.floor(point.z) - origin.z };
}

/** Same rules as canPlaceMapItem, plus the reason for a rejection (used for red ghost + message). */
export function evaluateDrop(item: Pick<PlaceableItem, "id" | "itemType">, position: MapPosition, items: PlaceableItem[], maxZ = 20, islandCount = 1): DropVerdict {
  if (isLockedMapObject(item)) return { valid: false, reason: "locked" };
  if (canPlaceMapItem(item, position, items, maxZ, islandCount)) return { valid: true, reason: "ok" };
  const size = itemFootprint(item.itemType, position.rotation);
  if (!isPlaceableArea(position.x, position.z, size.width, size.depth, islandCount, maxZ)) return { valid: false, reason: "bounds" };
  if (position.x < -1 && position.x + size.width > -5 && position.z < -3 && position.z + size.depth > -6) return { valid: false, reason: "water" };
  const hit = items.find((other) => other.id !== item.id && other.x !== null && other.z !== null && (() => {
    const footprint = itemFootprint(other.itemType, other.rotation);
    return position.x < other.x! + footprint.width && position.x + size.width > other.x! && position.z < other.z! + footprint.depth && position.z + size.depth > other.z!;
  })());
  return { valid: false, reason: hit && isLockedMapObject(hit) ? "street" : "overlap" };
}

export const nudgeKeys: Record<string, { x: number; z: number }> = { ArrowLeft: { x: -1, z: 0 }, ArrowRight: { x: 1, z: 0 }, ArrowUp: { x: 0, z: -1 }, ArrowDown: { x: 0, z: 1 } };

export function nudgePosition(position: MapPosition, key: string): MapPosition | null {
  const step = nudgeKeys[key];
  return step ? { ...position, x: position.x + step.x, z: position.z + step.z } : null;
}

/** Optimistic copy of the shop state with one item/house at a new position (null position = stored items only). */
export function applyMove(state: MapShopState, item: Pick<PlaceableItem, "id" | "itemType">, position: MapPosition): MapShopState {
  if (item.itemType === "house") {
    const layouts = state.layouts.filter(({ id }) => id !== item.id);
    return { ...state, layouts: [...layouts, { id: item.id, ...position }] };
  }
  return { ...state, items: state.items.map((owned: OwnedMapItem) => owned.id === item.id ? { ...owned, ...position } : owned) };
}

export type MoveRecord = { id: string; itemType: PlaceableItem["itemType"]; from: MapPosition; to: MapPosition };

export const samePosition = (a: MapPosition, b: MapPosition) => a.x === b.x && a.z === b.z && a.rotation === b.rotation;

/** Handlers the 3D world needs from the shop hook (keeps the world component free of shop state). */
export type DragApi = {
  enabled: boolean;
  move: (id: string, position: MapPosition) => void;
  reject: (verdict: DropVerdict) => void;
  nudge: (key: string) => boolean;
  confirm: () => void;
  cancel: () => void;
  undo: () => void;
};

export const LONG_PRESS_MS = 350;
export const MOUSE_DRAG_THRESHOLD = 4;
export const TOUCH_CANCEL_THRESHOLD = 10;
