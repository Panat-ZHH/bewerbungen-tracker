"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { fetchIncomingCount } from "@/lib/friend-requests";

type FriendRequestsState = { count: number; refresh: () => Promise<void>; setCount: (count: number) => void };
const FriendRequestsContext = createContext<FriendRequestsState>({ count: 0, refresh: async () => undefined, setCount: () => undefined });
export const POLL_MS = 30_000;

/** Shared number of open incoming friend requests. Loads on start + route change, refreshes on focus and every 30 s while visible
 *  (the project has no Realtime setup, so polling it is). The friends page pushes exact numbers via setCount after accept/decline. */
export function FriendRequestsProvider({ enabled, children }: { enabled: boolean; children: React.ReactNode }) {
  const pathname = usePathname();
  const [count, setCountState] = useState(0);
  const seq = useRef(0);

  const setCount = useCallback((value: number) => { seq.current += 1; setCountState(Math.max(0, value)); }, []);
  const refresh = useCallback(async () => {
    const mine = ++seq.current;
    try { const value = await fetchIncomingCount(); if (mine === seq.current) setCountState(value); } catch { /* keep the last number */ }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetch on start and on route change
    void refresh();
  }, [enabled, pathname, refresh]);

  useEffect(() => {
    if (!enabled) return;
    const onVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    const timer = window.setInterval(onVisible, POLL_MS);
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", onVisible); document.removeEventListener("visibilitychange", onVisible); };
  }, [enabled, refresh]);

  const value = useMemo(() => ({ count, refresh, setCount }), [count, refresh, setCount]);
  return <FriendRequestsContext.Provider value={value}>{children}</FriendRequestsContext.Provider>;
}

export function useFriendRequests() { return useContext(FriendRequestsContext); }
