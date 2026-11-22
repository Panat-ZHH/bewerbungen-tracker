import type { Application, ApplicationStatus } from "../types/index.ts";
import { STATUS_ORDER } from "./status.ts";
import { shopCatalog, type MapLayout, type OwnedMapItem, type ShopItemType } from "./map-shop.ts";
import { houseLabel, type ReadOnlyVillage } from "./read-only-village.ts";

/**
 * Parent view of a child's real village (/familie/kind/[id]/dorf), WATCH ONLY. Only calls family_child_village
 * (contract: docs/family/parent-village-contract.md). The server decides whether it may be seen (share_settings.village,
 * consent via _family_sharing_allowed, same family, active parent). Since 20261122190000_family_child_village_full_details.sql
 * the parent sees exactly what the child sees in its own village (/map): real ids, company, Stelle, real status (Zusage /
 * Absage), location and dates. The page renders the child's own VillageMap component with `watch` (read-only).
 */
export type FamilyVillage = ReadOnlyVillage & {
  childId: string;
  displayName: string | null;
  /** The child's houses with exactly the fields its own village shows (label + detail sheet). No notes, salary, contacts, links. */
  applications: Application[];
  layouts: MapLayout[];
  items: OwnedMapItem[];
};

export const familyVillagePath = (childId: string) => `/familie/kind/${encodeURIComponent(childId)}/dorf`;

const statuses: readonly string[] = STATUS_ORDER;
const num = (value: unknown, fallback = 0) => (typeof value === "number" && Number.isFinite(value) ? Math.round(value) : fallback);
const rows = (value: unknown): Record<string, unknown>[] => (Array.isArray(value) ? value.filter((r): r is Record<string, unknown> => !!r && typeof r === "object") : []);
const text = (value: unknown) => (typeof value === "string" ? value : "");
const optional = (value: unknown) => (typeof value === "string" && value.trim() ? value : undefined);

/** Validates the RPC JSON; unknown fields (notes, salary, contacts, links, ...) are never copied. */
export function parseFamilyVillage(data: unknown): FamilyVillage {
  const raw = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
  if (!raw || typeof raw !== "object") throw new Error("INVALID_VILLAGE");
  // The RPC sorts houses oldest first (created_at, id) = the order createApplicationMap() uses. Real ids and raw values, so the
  // 3D world (roof colour / ruin shape come from the id, the look from the status) is exactly the child's own village.
  const houses = rows(raw.houses).filter((h) => typeof h.id === "string" && statuses.includes(String(h.status)));
  const applications: Application[] = houses.map((h, index) => ({
    id: h.id as string,
    // An older RPC (before 20261122190000) sent no company when it was not shared: keep a visible label instead of an empty one.
    company: text(h.company) || houseLabel(index),
    position: text(h.position),
    ...(optional(h.location) ? { location: optional(h.location) } : {}),
    category: "other",
    status: h.status as ApplicationStatus,
    // Without dates (older RPC) a padded index keeps the RPC order in createApplicationMap().
    createdAt: optional(h.createdAt) ?? String(index).padStart(6, "0"),
    updatedAt: text(h.updatedAt),
    ...(optional(h.appliedAt) ? { appliedAt: optional(h.appliedAt) } : {}),
    ...(optional(h.deadline) ? { deadline: optional(h.deadline) } : {}),
  }));
  const ids = new Set(applications.map(({ id }) => `house:${id}`));
  const layouts = rows(raw.layouts).flatMap((l): MapLayout[] => (typeof l.id === "string" && ids.has(l.id) && typeof l.x === "number" && typeof l.z === "number" ? [{ id: l.id, x: num(l.x), z: num(l.z), rotation: num(l.rotation) }] : []));
  const items = rows(raw.items).flatMap((i): OwnedMapItem[] => (typeof i.id === "string" && String(i.itemType) in shopCatalog
    ? [{ id: i.id, itemType: i.itemType as ShopItemType, x: typeof i.x === "number" ? num(i.x) : null, z: typeof i.z === "number" ? num(i.z) : null, rotation: num(i.rotation), createdAt: typeof i.createdAt === "string" ? i.createdAt : "" }]
    : []));
  const name = typeof raw.display_name === "string" ? raw.display_name.trim().slice(0, 80) : "";
  return {
    childId: typeof raw.child_id === "string" ? raw.child_id : "",
    displayName: name || null,
    islandCount: Math.max(1, Math.min(99, num(raw.island_count, 1))),
    applications, layouts, items,
  };
}

export type FamilyVillageErrorKind = "reauth" | "not_shared" | "not_allowed" | "error";
/** Machine reason of NOT_SHARED (error hint, contract): which friendly text to show. */
export type FamilyVillageReason = "consent_pending" | "consent_withdrawn" | "village_off" | null;
type RpcError = { message?: unknown; code?: unknown; details?: unknown; hint?: unknown };
/**
 * NOT_SHARED (consent / village switched off) -> not_shared; NOT_FOUND / FORBIDDEN / NOT_IN_FAMILY -> not_allowed.
 * REAUTH_REQUIRED is not raised by family_child_village today (contract, change 4) but still means a fresh login.
 * PAYWALL is shown by the global paywall watcher (lib/access/client.ts); the page only shows the generic error.
 */
export function familyVillageErrorKind(error: unknown): FamilyVillageErrorKind {
  const e = (error ?? {}) as RpcError;
  const text = `${String(e.message ?? "")} ${String(e.code ?? "")}`;
  if (/REAUTH_REQUIRED/.test(text)) return "reauth";
  if (/NOT_SHARED|CONSENT|SHARING|WITHDRAWN/i.test(text)) return "not_shared";
  if (/NOT_FOUND|FORBIDDEN|NOT_IN_FAMILY|NOT_ALLOWED|42501/i.test(text)) return "not_allowed";
  return "error";
}
export function familyVillageReason(error: unknown): FamilyVillageReason {
  const hint = String(((error ?? {}) as RpcError).hint ?? "");
  return hint === "consent_pending" || hint === "consent_withdrawn" || hint === "village_off" ? hint : null;
}

export const FAMILY_VILLAGE_COPY = {
  title: (name: string) => `Dorf von ${name}`,
  readOnly: "Nur ansehen",
  /** `name`: childRef(name, "von ") = «Lina» / «deinem Kind». */
  info: (name: string) => `Du siehst das Dorf von ${name} genau so wie im eigenen Konto: Firma, Stelle, Status und Daten jeder Bewerbung. Nur ansehen: du kannst nichts verändern, verschieben oder kaufen.`,
  infoPrivate: "Notizen, Lohnangaben, Kontakte, Links und Dokumente bleiben privat.",
  notShared: (name: string) => `${name} teilt das Dorf im Moment nicht mit der Familie. Das ist in Ordnung: Teilen ist freiwillig.`,
  consentPending: "Das Dorf wird sichtbar, sobald du als Elternteil eingewilligt hast.",
  consentWithdrawn: "Die Einwilligung wurde zurückgezogen. Das Dorf ist gerade nicht sichtbar.",
  villageOff: "Dein Kind teilt sein Dorf gerade nicht. Das ist okay: es entscheidet selbst, was es zeigt.",
  notAllowed: "Dieses Dorf können wir dir nicht zeigen.",
  reauth: "Zum Schutz der Daten deines Kindes braucht es eine frische Anmeldung. Bitte melde dich erneut an.",
  error: "Das Dorf konnte nicht geladen werden. Versuche es bitte nochmals.",
  back: "Zurück zur Familie",
  login: "Neu anmelden",
  retry: "Erneut versuchen",
} as const;

/** Loads the child's village (throws with the PostgREST code/message so familyVillageErrorKind can map it). */
export async function getFamilyVillage(childId: string): Promise<FamilyVillage> {
  const { supabase } = await import("./supabase.ts");
  const { data, error } = await supabase.rpc("family_child_village", { p_child_id: childId });
  if (error) throw Object.assign(new Error([error.message, error.details].filter(Boolean).join(" | ") || "Database error"), { code: error.code, hint: error.hint });
  return parseFamilyVillage(data);
}
