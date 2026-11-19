// Tour state for the tour UI. The API is owned by onb-data (lib/tour/state.ts, SPEC-DATA §5.1); this file is the one place the
// tour imports it from, so the UI never depends on more than these three functions.
// INTERIM (until `git merge onb-data`): a local implementation of exactly that API (table product_tour_state, RPC tour_state_set).
import { supabase } from "@/lib/supabase";
import type { TourId } from "./tour-core";

export const TOUR_VERSION: Record<TourId, number> = { schueler: 1, eltern: 1, lehrperson: 1, schule: 1 };
type Status = "completed" | "skipped";
const localKey = (userId: string, tour: TourId) => `wendapply.tour.${userId}.${tour}`;

async function myId(): Promise<string | null> {
  try { const { data } = await supabase.auth.getSession(); return data.session?.user.id ?? null; } catch { return null; }
}
function readLocal(userId: string, tour: TourId): Status | null {
  try { const v = localStorage.getItem(localKey(userId, tour)); return v === "completed" || v === "skipped" ? v : null; } catch { return null; }
}

export async function loadTourState(tour: TourId): Promise<{ status: Status; version: number } | null> {
  const { data, error } = await supabase.from("product_tour_state").select("status,version").eq("tour", tour).maybeSingle();
  if (error || !data) return null;
  return data as { status: Status; version: number };
}

export async function saveTourState(tour: TourId, status: Status, step?: number): Promise<void> {
  const uid = await myId();
  const { error } = await supabase.rpc("tour_state_set", { p_tour: tour, p_version: TOUR_VERSION[tour], p_status: status, p_step: step ?? null });
  if (error && uid) { try { localStorage.setItem(localKey(uid, tour), status); } catch { /* storage blocked */ } }
}

export async function shouldAutoStart(tour: TourId, userId: string): Promise<boolean> {
  if (readLocal(userId, tour)) return false;
  const [{ data: profile, error }, row] = await Promise.all([
    supabase.from("profiles").select("funnel_completed_at").eq("user_id", userId).maybeSingle(),
    loadTourState(tour),
  ]);
  if (error || !profile || !(profile as { funnel_completed_at?: string | null }).funnel_completed_at) return false;
  return row === null;
}
