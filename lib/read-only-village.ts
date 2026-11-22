import type { Application, ApplicationStatus } from "../types/index.ts";
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

/** Pseudo house id by age (oldest = h0001), exactly what map_friend_island sends instead of the real application id. */
export const pseudoHouseId = (index: number) => `h${String(index + 1).padStart(4, "0")}`;

/** Statuses anybody who may see the village may see; results (Zusage, Absage, Rückzug, ...) only when shared. */
const OPEN_STATUSES: readonly ApplicationStatus[] = ["saved", "preparing", "applied", "interview", "final_interview"];
/**
 * Same rule as public._soc_friend_status (supabase/migrations/20261109050000_friends_privacy_defaults.sql): a result that is not
 * shared is shown as «Abgeschickt» (applied), so the house looks like a friend sees it (no ruin, no palace).
 */
export function maskedStatus(status: ApplicationStatus, outcomesShared: boolean): ApplicationStatus {
  return outcomesShared || OPEN_STATUSES.includes(status) ? status : "applied";
}

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
