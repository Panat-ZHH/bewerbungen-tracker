import { createApplicationMap } from "./application-map.ts";
import { isPlaceableArea, unlockedAreas } from "./islands.ts";
import type { Application } from "../types/index.ts";

export const APPLICATION_REWARD = 100;

export function isMapShopSetupError(reason: unknown) {
  if (!reason || typeof reason !== "object" || !("code" in reason)) return false;
  return ["PGRST202", "PGRST205", "42883", "42P01"].includes(String(reason.code));
}

export const shopCategories = ["Deko", "Park", "Autos", "E-Roller"] as const;
export type ShopCategory = typeof shopCategories[number];
export const shopRarities = { gewoehnlich: "Gewöhnlich", selten: "Selten", episch: "Episch", legendaer: "Legendär" } as const;
export type ShopRarity = keyof typeof shopRarities;

type CatalogEntry = { name: string; price: number; width: number; depth: number; category: ShopCategory; rarity: ShopRarity };

// Prices and footprints must match public.map_shop_catalog (server is authoritative for price and size).
// Brand names are plain German text labels only; the 3D models are original stylised designs without logos.
export const shopCatalog = {
  road: { name: "Strasse", price: 20, width: 1, depth: 1, category: "Deko", rarity: "gewoehnlich" },
  flowers: { name: "Blumenbeet", price: 30, width: 1, depth: 1, category: "Deko", rarity: "gewoehnlich" },
  tree: { name: "Zierbaum", price: 40, width: 1, depth: 1, category: "Deko", rarity: "gewoehnlich" },
  bench: { name: "Parkbank", price: 50, width: 2, depth: 1, category: "Park", rarity: "gewoehnlich" },
  fountain: { name: "Brunnen", price: 150, width: 2, depth: 2, category: "Park", rarity: "selten" },
  amusement_park: { name: "Freizeitpark", price: 500, width: 4, depth: 4, category: "Park", rarity: "episch" },
  scooter_city_mint: { name: "Stadt-Roller Mint", price: 60, width: 1, depth: 1, category: "E-Roller", rarity: "gewoehnlich" },
  scooter_city_lilac: { name: "Stadt-Roller Flieder", price: 60, width: 1, depth: 1, category: "E-Roller", rarity: "gewoehnlich" },
  scooter_sport_black: { name: "Sport-Roller Schwarz", price: 120, width: 1, depth: 1, category: "E-Roller", rarity: "gewoehnlich" },
  scooter_sport_lime: { name: "Sport-Roller Limette", price: 120, width: 1, depth: 1, category: "E-Roller", rarity: "gewoehnlich" },
  scooter_retro_cream: { name: "Retro-E-Moped Creme", price: 220, width: 1, depth: 1, category: "E-Roller", rarity: "selten" },
  scooter_retro_sky: { name: "Retro-E-Moped Himmelblau", price: 220, width: 1, depth: 1, category: "E-Roller", rarity: "selten" },
  scooter_retro_coral: { name: "Retro-E-Moped Koralle", price: 240, width: 1, depth: 1, category: "E-Roller", rarity: "selten" },
  car_porsche: { name: "Porsche-Sportwagen", price: 400, width: 2, depth: 1, category: "Autos", rarity: "selten" },
  car_audi_r8: { name: "Audi-R8-Sportwagen", price: 450, width: 2, depth: 1, category: "Autos", rarity: "selten" },
  car_amg: { name: "Mercedes-AMG-Sportwagen", price: 550, width: 2, depth: 1, category: "Autos", rarity: "selten" },
  car_mclaren: { name: "McLaren-Sportwagen", price: 900, width: 2, depth: 1, category: "Autos", rarity: "episch" },
  car_aston_martin: { name: "Aston-Martin-Sportwagen", price: 1100, width: 2, depth: 1, category: "Autos", rarity: "episch" },
  car_ferrari: { name: "Ferrari-Sportwagen", price: 1600, width: 2, depth: 1, category: "Autos", rarity: "episch" },
  car_lamborghini: { name: "Lamborghini-Sportwagen", price: 1900, width: 2, depth: 1, category: "Autos", rarity: "legendaer" },
  car_bugatti: { name: "Bugatti-Hypersportwagen", price: 2800, width: 2, depth: 1, category: "Autos", rarity: "legendaer" },
} as const satisfies Record<string, CatalogEntry>;

export type ShopItemType = keyof typeof shopCatalog;
export type MapPosition = { x: number; z: number; rotation: number };
export type OwnedMapItem = { id: string; itemType: ShopItemType; x: number | null; z: number | null; rotation: number; createdAt: string };
export const placeableCatalog = { ...shopCatalog, house: { name: "Bewerbungshaus", width: 5, depth: 5 }, street: { name: "Strasse", width: 1, depth: 1 } };
export type LayoutItem = Omit<OwnedMapItem, "itemType"> & { itemType: "house" | "street"; applicationId?: string };
export type PlaceableItem = OwnedMapItem | LayoutItem;
export type MapLayout = MapPosition & { id: string };
export type MapShopState = { balance: number; earned: number; rewardCount: number; items: OwnedMapItem[]; layouts: MapLayout[] };
export type Placement = { item: PlaceableItem; position: MapPosition };

export const isShopItemType = (value: unknown): value is ShopItemType => typeof value === "string" && Object.prototype.hasOwnProperty.call(shopCatalog, value);

/** Catalogue entries of one category ("Alle" = everything), cheapest first; ties keep catalogue order. */
export function shopItemsByCategory(category: ShopCategory | "Alle" = "Alle") {
  return (Object.keys(shopCatalog) as ShopItemType[])
    .filter((type) => category === "Alle" || shopCatalog[type].category === category)
    .map((type, index) => ({ type, index }))
    .sort((first, second) => shopCatalog[first.type].price - shopCatalog[second.type].price || first.index - second.index)
    .map(({ type }) => ({ type, ...shopCatalog[type] }));
}

/** True when the server does not know the item type yet (catalogue migration not applied): map_shop_buy raises INVALID_ITEM, a missing FK row gives 23503. */
export function isUnknownShopItemError(reason: unknown) {
  if (!reason || typeof reason !== "object") return false;
  const code = "code" in reason ? String(reason.code) : "";
  const message = "message" in reason ? String(reason.message) : "";
  return code === "23503" || message.includes("INVALID_ITEM");
}

export const SHOP_ITEM_SOON = "Dieses Modell ist bald erhältlich.";

export function shopBuyErrorMessage(reason: unknown) {
  if (isUnknownShopItemError(reason)) return SHOP_ITEM_SOON;
  if (reason instanceof Error && reason.message.includes("INSUFFICIENT_POINTS")) return "Du hast nicht genügend Punkte. Bitte aktualisiere den Shop.";
  return "Der Kauf konnte nicht bestätigt werden. Bitte versuche es erneut.";
}

/** Item types the server catalogue does not offer yet. Null rows (catalogue not readable) means: assume everything is available. */
export function unavailableShopItems(rows: { item_type: string }[] | null | undefined): Set<ShopItemType> {
  if (!rows?.length) return new Set();
  const known = new Set(rows.map(({ item_type }) => item_type));
  return new Set((Object.keys(shopCatalog) as ShopItemType[]).filter((type) => !known.has(type)));
}

export function villageDepth(applications: Application[]) {
  return Math.max(20, Math.ceil(createApplicationMap(applications).height / 48) - 5);
}

export const isLockedMapObject = (item: { id: string; itemType: string }) => item.itemType === "street" || item.id.startsWith("street:");

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
  const fixedStreets = [...streets.values()];
  return [...houses.map((object) => ({ ...object, ...layouts.find(({ id }) => id === object.id) })), ...fixedStreets];
}

function overlaps(x: number, z: number, width: number, depth: number, otherX: number, otherZ: number, otherWidth: number, otherDepth: number) {
  return x < otherX + otherWidth && x + width > otherX && z < otherZ + otherDepth && z + depth > otherZ;
}

export function itemFootprint(itemType: PlaceableItem["itemType"], rotation: number) {
  const item = placeableCatalog[itemType];
  return rotation % 2 === 0 ? { width: item.width, depth: item.depth } : { width: item.depth, depth: item.width };
}

export function canPlaceMapItem(item: Pick<PlaceableItem, "id" | "itemType">, position: MapPosition, items: PlaceableItem[], maxZ = 20, islandCount = 1) {
  if (isLockedMapObject(item)) return false;
  if (![position.x, position.z, position.rotation].every(Number.isInteger) || position.rotation < 0 || position.rotation > 3) return false;
  const size = itemFootprint(item.itemType, position.rotation);
  if (!isPlaceableArea(position.x, position.z, size.width, size.depth, islandCount, maxZ)) return false;
  if (overlaps(position.x, position.z, size.width, size.depth, -5, -6, 4, 3)) return false;
  // The eastern meadow (x >= 17) is a fixed 26-deep strip (z -6..20); the main island is deeper, so don't allow floating over the void.
  if (position.x + size.width > 17 && (position.z < -6 || position.z + size.depth > 20)) return false;
  return items.every((other) => {
    if (other.id === item.id || other.x === null || other.z === null) return true;
    const footprint = itemFootprint(other.itemType, other.rotation);
    return position.x + size.width <= other.x || other.x + footprint.width <= position.x || position.z + size.depth <= other.z || other.z + footprint.depth <= position.z;
  });
}

export function findFreeMapPosition(item: Pick<OwnedMapItem, "id" | "itemType">, items: PlaceableItem[], maxZ = 20, islandCount = 1): MapPosition | null {
  for (let z = 0; z < maxZ; z++) {
    for (let x = -9; x < 33; x++) {
      const position = { x, z, rotation: 0 };
      if (canPlaceMapItem(item, position, items, maxZ, islandCount)) return position;
    }
  }
  for (const area of unlockedAreas(islandCount, maxZ).slice(1)) {
    for (let z = area.z0; z < area.z1; z++) {
      for (let x = area.x0; x < area.x1; x++) {
        const position = { x, z, rotation: 0 };
        if (canPlaceMapItem(item, position, items, maxZ, islandCount)) return position;
      }
    }
  }
  return null;
}
