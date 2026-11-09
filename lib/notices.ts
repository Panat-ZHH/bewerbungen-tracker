import { useEffect, useSyncExternalStore } from "react";
import { listMyNotifications, markNotificationRead, type MyNotification } from "@/lib/classes";

/** Teacher notices ("Mitteilungen") for the signed-in student, shared by nav badge, bell and dashboard (P0 item 8). */
export type NoticesState = { items: MyNotification[] | null; failed: boolean };

let state: NoticesState = { items: null, failed: false };
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();
const emit = (next: NoticesState) => { state = next; listeners.forEach((l) => l()); };

export const unreadCount = (items: MyNotification[] | null): number => (items ?? []).filter((n) => !n.read).length;

export function refreshNotices(): Promise<void> {
  if (loading) return loading;
  loading = listMyNotifications()
    .then((items) => emit({ items, failed: false }))
    .catch(() => emit({ items: state.items ?? [], failed: true }))
    .finally(() => { loading = null; });
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
export function resetNotices() { loading = null; emit({ items: null, failed: false }); }

const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const getSnapshot = () => state;
const getServerSnapshot = (): NoticesState => ({ items: null, failed: false });

/** Loads once per page load (and again when the tab regains focus). Pass enabled=false for teachers. */
export function useNotices(enabled = true): NoticesState & { unread: number } {
  const current = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  useEffect(() => {
    if (!enabled) return;
    void refreshNotices();
    const onFocus = () => { void refreshNotices(); };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [enabled]);
  return { ...current, unread: unreadCount(current.items) };
}
