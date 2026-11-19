// Product tour state (SPEC-DATA §5.1 / A6 / A10). Owner: onb-data; used by components/tour/** (onb-tour).
// DB: table public.product_tour_state (own-row SELECT) + RPC tour_state_set() (migration 20261119100000_onboarding_funnel.sql).
// If the save fails, a localStorage flag keeps the tour from reappearing on this device and is retried on the next app start.
import { supabase } from "@/lib/supabase";

export type TourId = "schueler" | "eltern" | "lehrperson" | "schule";
export const TOUR_IDS = ["schueler", "eltern", "lehrperson", "schule"] as const;
export type TourStatus = "completed" | "skipped";
export const TOUR_STATUSES = ["completed", "skipped"] as const;
/** Bump a tour's version only to show a reworked tour again to everyone (state rows of the old version no longer count). */
export const TOUR_VERSION: Record<TourId, number> = { schueler: 1, eltern: 1, lehrperson: 1, schule: 1 };
export const TOUR_STEP_MAX = 30;
/** Query param for «Tour wiederholen» (SPEC-FLOW §6.6). */
export const TOUR_PARAM = "tour";
/** Start page of each tour (SPEC-FLOW §6.1). */
export const TOUR_START_PATH: Record<TourId, string> = { schueler: "/dashboard", eltern: "/familie", lehrperson: "/teacher", schule: "/schul-admin" };

export type TourRow = { status: TourStatus; version: number };
export const tourFallbackKey = (userId: string, tour: TourId) => `wendapply.tour.${userId}.${tour}`;

/** Which tour belongs to a role (role = routing role + account kind). */
export function tourForRole(role: "student" | "parent" | "teacher" | "school_admin"): TourId {
  return role === "parent" ? "eltern" : role === "teacher" ? "lehrperson" : role === "school_admin" ? "schule" : "schueler";
}
export const isTourId = (v: unknown): v is TourId => typeof v === "string" && (TOUR_IDS as readonly string[]).includes(v);

/**
 * Pure auto-start rule (unit tested): only accounts that went through the funnel, no stored state for the CURRENT version,
 * no local fallback flag on this device. A manual start (?tour=1) does not go through this.
 */
export function autoStartDecision(input: { funnelCompleted: boolean; row: TourRow | null; localFlag: TourStatus | null; version: number }): boolean {
  if (!input.funnelCompleted) return false;
  if (input.localFlag) return false;
  if (input.row && input.row.version >= input.version) return false;
  return true;
}
/** `?tour=1` in a search string / URLSearchParams. */
export function isManualTourStart(search: string | URLSearchParams | null | undefined): boolean {
  if (!search) return false;
  const p = typeof search === "string" ? new URLSearchParams(search.startsWith("?") ? search.slice(1) : search) : search;
  return p.get(TOUR_PARAM) === "1";
}

function parseRow(data: unknown): TourRow | null {
  const r = data as { status?: unknown; version?: unknown } | null;
  if (!r || (r.status !== "completed" && r.status !== "skipped")) return null;
  const version = Number(r.version);
  return Number.isInteger(version) ? { status: r.status, version } : null;
}
function local(): Storage | null { try { return typeof window === "undefined" ? null : window.localStorage; } catch { return null; } }
export function readLocalFlag(userId: string, tour: TourId): TourStatus | null {
  try { const v = local()?.getItem(tourFallbackKey(userId, tour)); return v === "completed" || v === "skipped" ? v : null; } catch { return null; }
}
function writeLocalFlag(userId: string, tour: TourId, status: TourStatus | null) {
  try { const s = local(); if (!s) return; if (status) s.setItem(tourFallbackKey(userId, tour), status); else s.removeItem(tourFallbackKey(userId, tour)); } catch { /* blocked */ }
}
async function currentUserId(): Promise<string | null> {
  try { const { data } = await supabase.auth.getUser(); return data.user?.id ?? null; } catch { return null; }
}

/** The stored state of the signed-in user for this tour (own row, RLS), or null (none / not signed in / read error). */
export async function loadTourState(tour: TourId): Promise<TourRow | null> {
  try {
    const userId = await currentUserId();
    if (!userId) return null;
    const { data, error } = await supabase.from("product_tour_state").select("status,version").eq("user_id", userId).eq("tour", tour).maybeSingle();
    return error ? null : parseRow(data);
  } catch { return null; }
}

/** Stores «completed» / «skipped» (tour_state_set). Never throws: on failure the local fallback flag is set. */
export async function saveTourState(tour: TourId, status: TourStatus, step?: number): Promise<void> {
  const userId = await currentUserId();
  if (!userId) return;
  const p_step = Number.isInteger(step) && step! >= 0 && step! <= TOUR_STEP_MAX ? step! : null;
  try {
    const { error } = await supabase.rpc("tour_state_set", { p_tour: tour, p_version: TOUR_VERSION[tour], p_status: status, p_step });
    writeLocalFlag(userId, tour, error ? status : null);
  } catch { writeLocalFlag(userId, tour, status); }
}

/** Retries a save that failed earlier on this device (call once per app start). Never throws. */
export async function retryPendingTourSaves(userId: string): Promise<void> {
  for (const tour of TOUR_IDS) {
    const flag = readLocalFlag(userId, tour);
    if (!flag) continue;
    try {
      const { error } = await supabase.rpc("tour_state_set", { p_tour: tour, p_version: TOUR_VERSION[tour], p_status: flag, p_step: null });
      if (!error) writeLocalFlag(userId, tour, null);
    } catch { /* next start */ }
  }
}

/** Should the tour start by itself for this user? (funnel accounts only; pre-release accounts use «Tour wiederholen»). */
export async function shouldAutoStart(tour: TourId, userId: string): Promise<boolean> {
  try {
    if (readLocalFlag(userId, tour)) return false;
    const { data, error } = await supabase.from("profiles").select("funnel_completed_at").eq("user_id", userId).maybeSingle();
    if (error) return false;
    const funnelCompleted = !!(data as { funnel_completed_at?: string | null } | null)?.funnel_completed_at;
    if (!funnelCompleted) return false;
    const row = await loadTourState(tour);
    return autoStartDecision({ funnelCompleted, row, localFlag: null, version: TOUR_VERSION[tour] });
  } catch { return false; }
}
