import type { Application, ApplicationStatus } from "../types/index.ts";
import { shopCatalog, type MapLayout, type OwnedMapItem, type ShopItemType } from "./map-shop.ts";

/** Everything the read-only island view needs. Houses carry at most the company name (if the owner shares it) and the building status; no position, notes or any other application data. */
export type FriendIsland = { userId: string; displayName: string; islands: number; companiesShared: boolean; applications: Application[]; items: OwnedMapItem[]; layouts: MapLayout[] };

const statuses: readonly string[] = ["saved", "preparing", "applied", "interview", "final_interview", "offer", "rejected", "withdrawn"];
const number = (value: unknown, fallback = 0) => (typeof value === "number" && Number.isFinite(value) ? value : fallback);

/** Neutral label for a house without a (shared) company name. */
export const houseLabel = (index: number) => `Haus ${index + 1}`;

/** Company names from the server: trimmed, control characters removed, max. 80 chars; anything else becomes undefined. */
export function cleanCompany(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  return text || undefined;
}

/** Validates the RPC payload and rebuilds Application objects that only contain the company name (if shared) or a neutral label, plus the building status. */
export function parseFriendIsland(data: unknown): FriendIsland {
  if (!data || typeof data !== "object") throw new Error("INVALID_ISLAND");
  const raw = data as Record<string, unknown>;
  const rows: unknown[] = Array.isArray(raw.applications) ? raw.applications : [];
  const valid = rows.filter((row): row is Record<string, unknown> => Boolean(row) && typeof (row as Record<string, unknown>).id === "string" && statuses.includes(String((row as Record<string, unknown>).status)));
  const applications: Application[] = valid.map((entry, index) => {
    const created = typeof entry.createdAt === "string" ? entry.createdAt : "";
    return { id: entry.id as string, company: cleanCompany(entry.company) ?? houseLabel(index), position: "", category: "other", status: entry.status as ApplicationStatus, createdAt: created, updatedAt: created };
  });
  const itemRows: unknown[] = Array.isArray(raw.items) ? raw.items : [];
  const items = itemRows.flatMap((row): OwnedMapItem[] => {
    const entry = row as Record<string, unknown> | null;
    if (!entry || typeof entry.id !== "string" || !(String(entry.itemType) in shopCatalog)) return [];
    return [{ id: entry.id, itemType: entry.itemType as ShopItemType, x: typeof entry.x === "number" ? entry.x : null, z: typeof entry.z === "number" ? entry.z : null, rotation: number(entry.rotation), createdAt: String(entry.createdAt ?? "") }];
  });
  const layoutRows: unknown[] = Array.isArray(raw.layouts) ? raw.layouts : [];
  const layouts = layoutRows.flatMap((row): MapLayout[] => {
    const entry = row as Record<string, unknown> | null;
    return entry && typeof entry.id === "string" && typeof entry.x === "number" && typeof entry.z === "number" ? [{ id: entry.id, x: entry.x, z: entry.z, rotation: number(entry.rotation) }] : [];
  });
  return { userId: String(raw.userId ?? ""), displayName: String(raw.displayName ?? ""), islands: Math.max(1, Math.min(99, Math.floor(number(raw.islands, 1)))), companiesShared: raw.companiesShared !== false, applications, items, layouts };
}

/** Dev/test data for `/friends/mock-*` when the app runs without a real Supabase project (dummy env vars). */
const mockCompanies = ["Swisscom", "UBS", "SBB", "Google Zürich", "Migros", "Zühlke", "Roche"];
export function mockFriendIsland(): FriendIsland {
  const day = (n: number) => `2026-10-${String(n).padStart(2, "0")}`;
  const list: ApplicationStatus[] = ["offer", "interview", "applied", "preparing", "rejected", "saved", "final_interview"];
  return parseFriendIsland({
    userId: "mock-friend", displayName: "Mia Muster", islands: 2,
    applications: list.map((status, index) => ({ id: `h${String(index + 1).padStart(4, "0")}`, status, createdAt: day(index + 1), company: mockCompanies[index] })),
    items: [
      { id: "m1", itemType: "tree", x: 8, z: 12, rotation: 0, createdAt: "2026-10-01" },
      { id: "m2", itemType: "fountain", x: 10, z: 12, rotation: 0, createdAt: "2026-10-02" },
      { id: "m3", itemType: "bench", x: 6, z: 12, rotation: 0, createdAt: "2026-10-03" },
    ],
    layouts: [],
  });
}

export const isMockFriend = (id: string) => id.startsWith("mock-") && !/\.supabase\.co/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");

/** Friends are only allowed to see an island when the database says so (see map_friend_island); errors carry NOT_FRIENDS / NOT_SHARED. */
export async function getFriendIsland(friendId: string): Promise<FriendIsland> {
  if (isMockFriend(friendId)) return mockFriendIsland();
  const { supabase } = await import("./supabase.ts");
  const { data, error } = await supabase.rpc("map_friend_island", { p_friend_id: friendId });
  if (error) throw Object.assign(new Error([error.code, error.message].filter(Boolean).join(" | ")), { code: error.code });
  return parseFriendIsland(data);
}

export function friendIslandError(reason: unknown) {
  const message = reason instanceof Error ? reason.message : String(reason ?? "");
  if (message.includes("NOT_FRIENDS")) return "Diese Insel kannst du nur ansehen, wenn ihr befreundet seid.";
  if (message.includes("NOT_SHARED")) return "Diese Person teilt ihre Insel gerade nicht mit Freunden.";
  return "Insel konnte nicht geladen werden";
}

/** Own switch: may friends see the company names on my island? (Default on.) */
export async function getShareCompanies(): Promise<boolean> {
  const { supabase } = await import("./supabase.ts");
  const { data, error } = await supabase.rpc("social_get_share_companies");
  if (error) throw Object.assign(new Error(error.message), { code: error.code });
  return data !== false;
}

export async function setShareCompanies(share: boolean): Promise<boolean> {
  const { supabase } = await import("./supabase.ts");
  const { data, error } = await supabase.rpc("social_set_share_companies", { p_share: share });
  if (error) throw Object.assign(new Error(error.message), { code: error.code });
  return data === true;
}
