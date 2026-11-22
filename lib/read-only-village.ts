import type { Application } from "../types/index.ts";
import type { MapLayout, OwnedMapItem } from "./map-shop.ts";
import { lockedDrag, noopHandler } from "./map-readonly.ts";

/**
 * One read-only village, whoever looks at it: a friend (/friends/[id], map_friend_island) or a parent
 * (/familie/kind/[id]/dorf, family_child_village). Both views render it with exactly the same props, so the parent sees
 * the same live village as a friend: villagers, builders, water, fire/smoke, day/night, island switching.
 */
export type ReadOnlyVillage = {
  /** Houses: id, status and a label (company name if shared, else the neutral «Haus N»). Nothing else. */
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
