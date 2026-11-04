import { createApplicationMap } from "./application-map.ts";
import type { Application } from "../types/index.ts";

export const APPLICATION_REWARD = 100;

export function isMapShopSetupError(reason: unknown) {
  if (!reason || typeof reason !== "object" || !("code" in reason)) return false;
  return ["PGRST202", "PGRST205", "42883", "42P01"].includes(String(reason.code));
}

export const shopCatalog = {
  road: { name: "Straße", price: 20, width: 1, depth: 1 },
  flowers: { name: "Blumenbeet", price: 30, width: 1, depth: 1 },
  tree: { name: "Zierbaum", price: 40, width: 1, depth: 1 },
  bench: { name: "Parkbank", price: 50, width: 2, depth: 1 },
  fountain: { name: "Brunnen", price: 150, width: 2, depth: 2 },
  amusement_park: { name: "Freizeitpark", price: 500, width: 4, depth: 4 },
} as const;

export type ShopItemType = keyof typeof shopCatalog;
export type MapPosition = { x: number; z: number; rotation: number };
export type OwnedMapItem = { id: string; itemType: ShopItemType; x: number | null; z: number | null; rotation: number; createdAt: string };
export const placeableCatalog = { ...shopCatalog, house: { name: "Bewerbungshaus", width: 5, depth: 5 }, street: { name: "Straße", width: 1, depth: 1 } };
export type LayoutItem = Omit<OwnedMapItem, "itemType"> & { itemType: "house" | "street"; applicationId?: string };
export type PlaceableItem = OwnedMapItem | LayoutItem;
export type MapLayout = MapPosition & { id: string };
export type MapShopState = { balance: number; earned: number; rewardCount: number; items: OwnedMapItem[]; layouts: MapLayout[] };
export type Placement = { item: PlaceableItem; position: MapPosition };

export function villageDepth(applications: Application[]) {
  return Math.max(20, Math.ceil(createApplicationMap(applications).height / 48) - 5);
}

export function villageObjects(applications: Application[], layouts: MapLayout[] = []): LayoutItem[] {
  const plots = createApplicationMap(applications).plots;
  const houses: LayoutItem[] = plots.map(({ application, x, y }) => ({ id: `house:${application.id}`, itemType: "house", applicationId: application.id, x: Math.floor((x - 700) / 48) - 2, z: Math.floor((y - 270) / 48) - 2, rotation: 0, createdAt: application.createdAt }));
  const streets = new Map<string, LayoutItem>();
  function road(x: number, z: number) {
    if (houses.some((house) => overlaps(x, z, 1, 1, house.x!, house.z!, 5, 5)) || overlaps(x, z, 1, 1, -5, -6, 4, 3)) return;
    const id = `street:${x}:${z}`;
    streets.set(id, { id, itemType: "street", x, z, rotation: 0, createdAt: "" });
  }
  for (let z = -6; z < villageDepth(applications); z++) road(-4, z);
  for (let row = 0; row < Math.max(1, Math.ceil(plots.length / 3)); row++) {
    for (let x = -10; x < 15; x++) road(x, Math.floor(3.5 + row * 7.5));
  }
  houses.forEach((house, index) => {
    for (let z = house.z! + 5; z < Math.floor(3.5 + Math.floor(index / 3) * 7.5); z++) road(house.x! + 2, z);
  });
  return [...houses, ...streets.values()].map((object) => ({ ...object, ...layouts.find(({ id }) => id === object.id) }));
}

function overlaps(x: number, z: number, width: number, depth: number, otherX: number, otherZ: number, otherWidth: number, otherDepth: number) {
  return x < otherX + otherWidth && x + width > otherX && z < otherZ + otherDepth && z + depth > otherZ;
}

export function itemFootprint(itemType: PlaceableItem["itemType"], rotation: number) {
  const item = placeableCatalog[itemType];
  return rotation % 2 === 0 ? { width: item.width, depth: item.depth } : { width: item.depth, depth: item.width };
}

export function canPlaceMapItem(item: Pick<PlaceableItem, "id" | "itemType">, position: MapPosition, items: PlaceableItem[], maxZ = 20) {
  if (![position.x, position.z, position.rotation].every(Number.isInteger) || position.rotation < 0 || position.rotation > 3) return false;
  const size = itemFootprint(item.itemType, position.rotation);
  if (position.x < -10 || position.z < -7 || position.x + size.width > 33 || position.z + size.depth > maxZ) return false;
  if (overlaps(position.x, position.z, size.width, size.depth, -5, -6, 4, 3)) return false;
  return items.every((other) => {
    if (other.id === item.id || other.x === null || other.z === null) return true;
    const footprint = itemFootprint(other.itemType, other.rotation);
    return position.x + size.width <= other.x || other.x + footprint.width <= position.x || position.z + size.depth <= other.z || other.z + footprint.depth <= position.z;
  });
}

export function findFreeMapPosition(item: Pick<OwnedMapItem, "id" | "itemType">, items: PlaceableItem[], maxZ = 20): MapPosition | null {
  for (let z = 0; z < maxZ; z++) {
    for (let x = -9; x < 33; x++) {
      const position = { x, z, rotation: 0 };
      if (canPlaceMapItem(item, position, items, maxZ)) return position;
    }
  }
  return null;
}