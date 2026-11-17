"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { ACCESS_CHANGED_EVENT, accessIsStale, cachedAccess, installPaywallWatcher, loadMyAccess, PAYWALL_EVENT } from "@/lib/access/client";
import type { AccessInfo } from "@/lib/access/types";

type AccessContextValue = {
  /** null while loading (render the page normally, the server is the real gate). */
  access: AccessInfo | null;
  /** Signed in, first answer not there yet. */
  loading: boolean;
  /** Re-read my_access() (after a billing return, a PAYWALL error, on focus). */
  refresh: () => Promise<AccessInfo | null>;
};

const AccessContext = createContext<AccessContextValue>({ access: null, loading: false, refresh: async () => null });

/** Access state of the signed-in user. `userId` null = signed out (no access UI); undefined = follow the Supabase session. */
export function AccessProvider({ userId: fixedUserId, children }: { userId?: string | null; children: React.ReactNode }) {
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const userId = fixedUserId === undefined ? sessionUserId : fixedUserId;
  const [access, setAccess] = useState<AccessInfo | null>(() => cachedAccess(userId));

  useEffect(() => {
    if (fixedUserId !== undefined) return;
    let alive = true;
    supabase.auth.getSession().then(({ data }) => { if (alive) setSessionUserId(data.session?.user.id ?? null); });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => setSessionUserId(session?.user.id ?? null));
    return () => { alive = false; listener.subscription.unsubscribe(); };
  }, [fixedUserId]);

  const refresh = useCallback(async () => {
    if (!userId) return null;
    const info = await loadMyAccess({ force: true, userId });
    setAccess(info);
    return info;
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    installPaywallWatcher();
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- another user's cached value must not leak into this session
    setAccess(cachedAccess(userId));
    loadMyAccess({ userId }).then((info) => { if (alive) setAccess(info); });
    const onChanged = (event: Event) => { const info = (event as CustomEvent<AccessInfo>).detail; if (info) setAccess(info); };
    // The server said PAYWALL: re-read so the shell switches to the paywall (or nothing changes if it was a race).
    const onPaywall = () => { loadMyAccess({ force: true, userId }).catch(() => {}); };
    const onFocus = () => { if (document.visibilityState !== "hidden" && accessIsStale()) loadMyAccess({ force: true, userId }).catch(() => {}); };
    window.addEventListener(ACCESS_CHANGED_EVENT, onChanged);
    window.addEventListener(PAYWALL_EVENT, onPaywall);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      alive = false;
      window.removeEventListener(ACCESS_CHANGED_EVENT, onChanged);
      window.removeEventListener(PAYWALL_EVENT, onPaywall);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [userId]);

  return <AccessContext.Provider value={{ access: userId ? access : null, loading: !!userId && !access, refresh }}>{children}</AccessContext.Provider>;
}

export function useAccess() { return useContext(AccessContext); }
