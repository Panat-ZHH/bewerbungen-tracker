import { useEffect, useSyncExternalStore } from "react";
import { listMyNotifications, markNotificationRead, type MyNotification } from "@/lib/classes";
import { sessionUser } from "@/lib/session-user";

/** Teacher notices ("Mitteilungen") for the signed-in student, shared by nav badge, bell and dashboard (P0 item 8). */
export type NoticesState = { items: MyNotification[] | null; failed: boolean };

let state: NoticesState = { items: null, failed: false };
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();
const emit = (next: NoticesState) => { state = next; listeners.forEach((l) => l()); };

export const unreadCount = (items: MyNotification[] | null): number => (items ?? []).filter((n) => !n.read).length;

/** Who the current list belongs to and when it was read (perf: badge / bell / card mount at different moments of one page). */
let loaded: { userId: string; at: number } | null = null;
/** A component mounting within this time after a successful read for the same user reuses it (focus always re-reads). */
export const NOTICES_REUSE_MS = 15_000;
/** Pure: may a mount reuse the list read at `loaded` for `userId`? Never for another user or after a failed read. */
export function canReuseNotices(last: { userId: string; at: number } | null, userId: string | null, now: number, maxAgeMs: number): boolean {
  return !!last && !!userId && last.userId === userId && now - last.at >= 0 && now - last.at < maxAgeMs;
}

/** Re-reads the notices. `maxAgeMs`: skip when this user's list is younger than that (used on mount, not on focus). */
export function refreshNotices(opts: { maxAgeMs?: number } = {}): Promise<void> {
  if (loading) return loading;
  loading = (async () => {
    const userId = (await sessionUser().catch(() => null))?.id ?? null;
    if (opts.maxAgeMs && state.items && !state.failed && canReuseNotices(loaded, userId, Date.now(), opts.maxAgeMs)) return;
    try {
      const items = await listMyNotifications();
      loaded = userId ? { userId, at: Date.now() } : null;
      emit({ items, failed: false });
    } catch {
      loaded = null;
      emit({ items: state.items ?? [], failed: true });
    }
  })().finally(() => { loading = null; });
  return loading;
}

export async function markNoticeRead(id: string): Promise<void> {
  const before = state;
  emit({ ...state, items: (state.items ?? []).map((n) => (n.id === id ? { ...n, read: true } : n)) });
  try { await markNotificationRead(id); } catch { emit(before); void refreshNotices(); }
}

export function markAllNoticesRead(): Promise<void[]> {
  return Promise.all((state.items ?? []).filter((n) => !n.read).map((n) => markNoticeRead(n.id)));
}

/** Test helper / sign-out: forget everything. */
export function resetNotices() { loading = null; loaded = null; emit({ items: null, failed: false }); }

const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const getSnapshot = () => state;
const getServerSnapshot = (): NoticesState => ({ items: null, failed: false });

/** Loads once per page load (and again when the tab regains focus). Pass enabled=false for teachers. */
export function useNotices(enabled = true): NoticesState & { unread: number } {
  const current = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  useEffect(() => {
    if (!enabled) return;
    void refreshNotices({ maxAgeMs: NOTICES_REUSE_MS });
    const onFocus = () => { void refreshNotices(); };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [enabled]);
  return { ...current, unread: unreadCount(current.items) };
}
