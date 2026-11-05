"use client";

import { useCallback, useSyncExternalStore } from "react";
import { OVERLAY_KEY_PREFIX, parseStoredFlag } from "@/lib/map-layout";

const listeners = new Set<() => void>();
function subscribe(callback: () => void) {
  listeners.add(callback);
  window.addEventListener("storage", callback);
  return () => { listeners.delete(callback); window.removeEventListener("storage", callback); };
}
function read(key: string) {
  try { return window.localStorage.getItem(OVERLAY_KEY_PREFIX + key); } catch { return null; }
}

/** Raw string persisted in localStorage (null until set / on the server). */
export function useStoredValue(key: string): [string | null, (value: string) => void] {
  const value = useSyncExternalStore(subscribe, () => read(key), () => null);
  const set = useCallback((next: string) => {
    try { window.localStorage.setItem(OVERLAY_KEY_PREFIX + key, next); } catch { /* private mode: state just is not remembered */ }
    listeners.forEach((listener) => listener());
  }, [key]);
  return [value, set];
}

/** Boolean overlay state that survives reloads (e.g. "controls collapsed"). */
export function useStoredFlag(key: string, fallback: boolean): [boolean, (value: boolean) => void] {
  const [raw, setRaw] = useStoredValue(key);
  const set = useCallback((next: boolean) => setRaw(next ? "1" : "0"), [setRaw]);
  return [parseStoredFlag(raw, fallback), set];
}
