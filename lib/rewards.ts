// Instant micro-rewards (toast + stamp/confetti from lib/joy.ts) and the weekly goal. Progress is local (localStorage); the weekly
// goal lives in profiles.weekly_goal with localStorage as cache (loadWeeklyGoal / saveWeeklyGoal below). Pure helpers live in rewards-core.ts (unit-tested in tests/rewards.test.mjs).
import { toast } from "@/lib/toast";
import { confetti, stamp } from "@/lib/joy";
import { bumpProgress, clampGoal as clampWeeklyGoal, DEFAULT_WEEKLY_GOAL as DEFAULT_GOAL, messages, PROGRESS_KEY, readGoal as readLocalGoal, readProgress, storage, writeGoal as writeLocalGoal, type RewardKind } from "@/lib/rewards-core";
import { supabase } from "@/lib/supabase";
export * from "@/lib/rewards-core";

const listeners = new Set<() => void>();
export function subscribeProgress(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }

export { confetti };

/** Call right after a successful save/status change. Toast always, "ABGESCHICKT!" stamp for a sent application, confetti for a follow-up, progress counted. */
export function reward(kind: RewardKind) {
  const list = messages[kind];
  toast({ message: list[Math.floor(Math.random() * list.length)], tone: "success", duration: 3500 });
  if (kind === "applied") stamp("Abgeschickt!", "blue");
  else if (kind === "followup") confetti(14);
  try { storage()?.setItem(PROGRESS_KEY, JSON.stringify(bumpProgress(readProgress(), kind))); } catch { /* storage full or blocked */ }
  listeners.forEach((l) => l());
}

// ---- Weekly goal: profiles.weekly_goal is the source (SPEC-DATA A9 / §4); localStorage is the cache (no flash, offline). ----

/** Pure: which goal wins and whether the device value must be migrated to the profile once. */
export function resolveWeeklyGoal(dbGoal: unknown, localGoal: number): { goal: number; migrate: boolean } {
  const db = Number(dbGoal);
  if (dbGoal !== null && dbGoal !== undefined && Number.isInteger(db) && db >= 1) return { goal: clampWeeklyGoal(db), migrate: false };
  // Legacy: only a device setting that differs from the default is worth storing (no prompt).
  return { goal: localGoal, migrate: localGoal !== DEFAULT_GOAL };
}

/** profiles.weekly_goal (own row) → else the local value → 3. Writes the result to the local cache; migrates a legacy device goal once. */
export async function loadWeeklyGoal(userId?: string | null): Promise<number> {
  const local = readLocalGoal();
  try {
    let uid = userId ?? null;
    if (!uid) uid = (await supabase.auth.getUser()).data.user?.id ?? null;
    if (!uid) return local;
    const { data, error } = await supabase.from("profiles").select("weekly_goal").eq("user_id", uid).maybeSingle();
    if (error) return local;
    const { goal, migrate } = resolveWeeklyGoal((data as { weekly_goal?: number | null } | null)?.weekly_goal, local);
    try { writeLocalGoal(goal); } catch { /* storage blocked */ }
    if (migrate) void sendWeeklyGoal(goal);
    return goal;
  } catch { return local; }
}

let goalTimer: ReturnType<typeof setTimeout> | null = null;
async function sendWeeklyGoal(goal: number): Promise<boolean> {
  try { const { error } = await supabase.rpc("weekly_goal_set", { p_goal: clampWeeklyGoal(goal) }); return !error; } catch { return false; }
}
/** Saves locally at once and to the profile debounced (600 ms). PAYWALL / rate limit / network: the local value stays, silently. */
export function saveWeeklyGoal(goal: number, delayMs = 600): void {
  const value = clampWeeklyGoal(goal);
  try { writeLocalGoal(value); } catch { /* storage blocked */ }
  if (goalTimer) clearTimeout(goalTimer);
  goalTimer = setTimeout(() => { goalTimer = null; void sendWeeklyGoal(value); }, delayMs);
}
