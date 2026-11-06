// Pure/local helpers for rewards + weekly goal (no app imports so node tests can load it).
export type RewardKind = "saved" | "applied" | "followup";
export const DEFAULT_WEEKLY_GOAL = 3;
export const MAX_WEEKLY_GOAL = 20;
const GOAL_KEY = "wendapply-weekly-goal";
export const PROGRESS_KEY = "wendapply-weekly-progress";

export const messages: Record<RewardKind, string[]> = {
  saved: ["Gemerkt – gut gesehen!", "Gemerkt. Die Stelle wartet auf dich."],
  applied: ["Abgeschickt – stark, das war der schwierigste Schritt!", "Abgeschickt. Das zählt für dein Wochenziel."],
  followup: ["Nachgefasst – dranbleiben lohnt sich!", "Nachgefasst. Das fällt auf, im guten Sinn."],
};

/** Monday of the week containing `date`, as local yyyy-mm-dd (weeks start on Monday). */
export function weekStart(date = new Date()): string {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function clampGoal(value: unknown): number {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(MAX_WEEKLY_GOAL, Math.max(1, n)) : DEFAULT_WEEKLY_GOAL;
}

export type WeeklyProgress = { week: string; applied: number; saved: number; followup: number };
export function emptyProgress(week = weekStart()): WeeklyProgress { return { week, applied: 0, saved: 0, followup: 0 }; }
/** Adds one action; a stored record from an earlier week is reset first. */
export function bumpProgress(current: WeeklyProgress | null | undefined, kind: RewardKind, now = new Date()): WeeklyProgress {
  const week = weekStart(now);
  const base = current && current.week === week ? current : emptyProgress(week);
  return { ...base, [kind]: base[kind] + 1 };
}

export function storage(): Storage | null { try { return typeof window === "undefined" ? null : window.localStorage; } catch { return null; } }
export function readGoal(): number { const raw = storage()?.getItem(GOAL_KEY); return raw ? clampGoal(raw) : DEFAULT_WEEKLY_GOAL; }
export function writeGoal(value: number) { storage()?.setItem(GOAL_KEY, String(clampGoal(value))); }
export function readProgress(now = new Date()): WeeklyProgress {
  try {
    const parsed = JSON.parse(storage()?.getItem(PROGRESS_KEY) ?? "null") as WeeklyProgress | null;
    return parsed && parsed.week === weekStart(now) ? { ...emptyProgress(parsed.week), ...parsed } : emptyProgress(weekStart(now));
  } catch { return emptyProgress(weekStart(now)); }
}

