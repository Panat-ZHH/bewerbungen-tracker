import type { Application } from "../types/index.ts";
import type { MapLayout, OwnedMapItem } from "./map-shop.ts";
import { lockedDrag, noopHandler } from "./map-readonly.ts";

/**
 * A read-only village: what a friend sees (/friends/[id], map_friend_island, rendered by ReadOnlyVillageView) and the data part
 * of the parent view (/familie/kind/[id]/dorf, family_child_village). Since 2026-11-22 (20261122190000) the parent view is NOT
 * the friend view any more: it renders the child's own VillageMap in watch mode with the child's full house details.
 */
export type ReadOnlyVillage = {
  /** Houses. Friends: pseudo id, status and a label (company if shared, else «Haus N»). Parents: the child's own house details. */
  applications: Application[];
  items: OwnedMapItem[];
  layouts: MapLayout[];
  islandCount: number;
};

/** Neutral label for a house without a (shared) company name: «Haus 1», «Haus 2», ... */
export const houseLabel = (index: number) => `Haus ${index + 1}`;

/**
 * Data props for ApplicationMapWorld in read-only mode (camera props come from the page). Every mutating handler is a
 * no-op and drag is locked; ApplicationMapWorld's readOnly flag enforces the same once more.
 */
export function readOnlyWorldProps(village: ReadOnlyVillage) {
  return {
    readOnly: true as const,
    applications: village.applications,
    visibleIds: village.applications.map(({ id }) => id),
    selectedId: null,
    shopItems: village.items,
    layouts: village.layouts,
    selectedShopItemId: null,
    placement: null,
    onSelect: noopHandler,
    onSelectShopItem: noopHandler,
    onPlacePosition: noopHandler,
    drag: lockedDrag,
    islandCount: village.islandCount,
  };
}
