"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { ACCESS_CHANGED_EVENT, accessIsStale, cachedAccess, installPaywallWatcher, loadMyAccess, PAYWALL_EVENT } from "@/lib/access/client";
import type { AccessInfo } from "@/lib/access/types";

type AccessContextValue = {
  /** null while loading (render the page normally, the server is the real gate). */
  access: AccessInfo | null;
  /** Re-read my_access() (after a billing return, a PAYWALL error, on focus). */
  refresh: () => Promise<AccessInfo | null>;
};

const AccessContext = createContext<AccessContextValue>({ access: null, refresh: async () => null });

/** Access state of the signed-in user. `userId` null = signed out (no access UI). */
export function AccessProvider({ userId, children }: { userId: string | null; children: React.ReactNode }) {
  const [access, setAccess] = useState<AccessInfo | null>(() => cachedAccess(userId));

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

  return <AccessContext.Provider value={{ access: userId ? access : null, refresh }}>{children}</AccessContext.Provider>;
}

export function useAccess() { return useContext(AccessContext); }
