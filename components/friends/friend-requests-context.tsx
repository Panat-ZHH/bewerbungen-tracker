"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { fetchIncomingCount } from "@/lib/friend-requests";
import { shouldPollRequests } from "@/lib/friend-badge";
import { supabase } from "@/lib/supabase";

type FriendRequestsState = { count: number; refresh: () => Promise<void>; setCount: (count: number) => void };
const FriendRequestsContext = createContext<FriendRequestsState>({ count: 0, refresh: async () => undefined, setCount: () => undefined });
export const POLL_MS = 30_000;

/** Shared number of open incoming friend requests. Loads on start + route change, refreshes on focus and every 30 s while visible
 *  (the project has no Realtime setup, so polling it is). The friends page pushes exact numbers via setCount after accept/decline. */
export function FriendRequestsProvider({ enabled, children }: { enabled: boolean; children: React.ReactNode }) {
  const pathname = usePathname();
  const [count, setCountState] = useState(0);
  const seq = useRef(0);
  // Logged-out pages (e.g. /bewerbung-check) share the shell: never call social_list without a session (it answers 401).
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    void supabase.auth.getSession().then(({ data }) => { if (alive) setSignedIn(Boolean(data.session)); }).catch(() => undefined);
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedIn(Boolean(session));
      if (!session) { seq.current += 1; setCountState(0); }
    });
    return () => { alive = false; listener.subscription.unsubscribe(); };
  }, [enabled]);
  const active = shouldPollRequests(enabled, signedIn);

  const setCount = useCallback((value: number) => { seq.current += 1; setCountState(Math.max(0, value)); }, []);
  const refresh = useCallback(async () => {
    const mine = ++seq.current;
    try { const value = await fetchIncomingCount(); if (mine === seq.current) setCountState(value); } catch { /* keep the last number */ }
  }, []);

  useEffect(() => {
    if (!active) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetch on start and on route change
    void refresh();
  }, [active, pathname, refresh]);

  useEffect(() => {
    if (!active) return;
    const onVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    const timer = window.setInterval(onVisible, POLL_MS);
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", onVisible); document.removeEventListener("visibilitychange", onVisible); };
  }, [active, refresh]);

  const value = useMemo(() => ({ count, refresh, setCount }), [count, refresh, setCount]);
  return <FriendRequestsContext.Provider value={value}>{children}</FriendRequestsContext.Provider>;
}

export function useFriendRequests() { return useContext(FriendRequestsContext); }
