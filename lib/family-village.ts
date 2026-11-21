import type { Application, ApplicationStatus } from "../types/index.ts";
import { STATUS_ORDER } from "./status.ts";
import { shopCatalog, type MapLayout, type OwnedMapItem, type ShopItemType } from "./map-shop.ts";
import { cleanCompany } from "./friend-island.ts";

/**
 * Parent view of a child's real village (/familie/kind/[id]/dorf), read-only. Only calls family_child_village
 * (contract: docs/family/parent-village-contract.md). The server decides what may be seen: share_settings.village,
 * consent (_family_sharing_allowed), same family, active parent; company names only when the child also shares applications.
 * The parser rebuilds Application objects with nothing but id, status and (optionally) the company name.
 */
export type FamilyVillage = {
  childId: string;
  displayName: string | null;
  islandCount: number;
  showCompanies: boolean;
  /** Props for ApplicationMapWorld: company is "" when not shared (the page hides those labels). */
  applications: Application[];
  layouts: MapLayout[];
  items: OwnedMapItem[];
};

export const familyVillagePath = (childId: string) => `/familie/kind/${encodeURIComponent(childId)}/dorf`;

const statuses: readonly string[] = STATUS_ORDER;
const num = (value: unknown, fallback = 0) => (typeof value === "number" && Number.isFinite(value) ? Math.round(value) : fallback);
const rows = (value: unknown): Record<string, unknown>[] => (Array.isArray(value) ? value.filter((r): r is Record<string, unknown> => !!r && typeof r === "object") : []);

/** Validates the RPC JSON; unknown fields (notes, salary, contacts, links, ...) are never copied. */
export function parseFamilyVillage(data: unknown): FamilyVillage {
  const raw = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
  if (!raw || typeof raw !== "object") throw new Error("INVALID_VILLAGE");
  const showCompanies = raw.show_companies === true;
  const applications: Application[] = rows(raw.houses)
    .filter((h) => typeof h.id === "string" && statuses.includes(String(h.status)))
    .map((h) => ({ id: h.id as string, company: (showCompanies && cleanCompany(h.company)) || "", position: "", category: "other", status: h.status as ApplicationStatus, createdAt: "", updatedAt: "" }));
  const layouts = rows(raw.layouts).flatMap((l): MapLayout[] => (typeof l.id === "string" && typeof l.x === "number" && typeof l.z === "number" ? [{ id: l.id, x: num(l.x), z: num(l.z), rotation: num(l.rotation) }] : []));
  const items = rows(raw.items).flatMap((i): OwnedMapItem[] => (typeof i.id === "string" && String(i.itemType) in shopCatalog
    ? [{ id: i.id, itemType: i.itemType as ShopItemType, x: typeof i.x === "number" ? num(i.x) : null, z: typeof i.z === "number" ? num(i.z) : null, rotation: num(i.rotation), createdAt: typeof i.createdAt === "string" ? i.createdAt : "" }]
    : []));
  const name = typeof raw.display_name === "string" ? raw.display_name.trim().slice(0, 80) : "";
  return {
    childId: typeof raw.child_id === "string" ? raw.child_id : "",
    displayName: name || null,
    islandCount: Math.max(1, Math.min(99, num(raw.island_count, 1))),
    showCompanies,
    applications, layouts, items,
  };
}

export type FamilyVillageErrorKind = "reauth" | "not_shared" | "error";
/** REAUTH_REQUIRED (MFA / fresh login, _acc_wrap guard) -> new login; not shared / no consent / not my child -> friendly message. */
export function familyVillageErrorKind(error: unknown): FamilyVillageErrorKind {
  const e = (error ?? {}) as { message?: unknown; code?: unknown; details?: unknown };
  const text = `${String(e.message ?? "")} ${String(e.code ?? "")}`;
  if (/REAUTH_REQUIRED/.test(text)) return "reauth";
  if (/NOT_SHARED|NOT_FOUND|FORBIDDEN|CONSENT|SHARING|WITHDRAWN|NOT_ALLOWED|42501/i.test(text)) return "not_shared";
  return "error";
}

export const FAMILY_VILLAGE_COPY = {
  title: (name: string) => `Dorf von ${name}`,
  readOnly: "Nur ansehen",
  infoCompanies: (name: string) => `Du siehst das Dorf und die Firmennamen, bei denen sich ${name} beworben hat.`,
  infoNoCompanies: "Du siehst nur das Dorf, ohne Firmennamen.",
  infoPrivate: "Stellen, Notizen, Kontakte und Dokumente bleiben privat.",
  notShared: (name: string) => `${name} teilt das Dorf im Moment nicht mit der Familie. Das ist in Ordnung: Teilen ist freiwillig.`,
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
  if (error) throw Object.assign(new Error([error.message, error.details].filter(Boolean).join(" | ") || "Database error"), { code: error.code });
  return parseFamilyVillage(data);
}
