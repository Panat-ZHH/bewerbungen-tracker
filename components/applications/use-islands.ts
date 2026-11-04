"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getIslands, unlockIsland } from "@/lib/islands-storage";
import { canUnlockIsland, nextIsland } from "@/lib/islands";
import { isMapShopSetupError } from "@/lib/map-shop";
import { supabase } from "@/lib/supabase";

export type IslandFocus = { no: number; reveal: boolean; key: number };

/** Unlocked islands for the current user. Without the islands migration only the free first island exists (fallback). */
export function useIslands(refresh: number, onUnlocked: () => void) {
  const [unlocked, setUnlocked] = useState(1);
  const [available, setAvailable] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [celebrate, setCelebrate] = useState<number | null>(null);
  const [focus, setFocus] = useState<IslandFocus | null>(null);
  const [current, setCurrent] = useState(1);
  const locked = useRef(false);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const state = await getIslands();
        if (active) { setUnlocked(state.unlocked); setAvailable(true); }
      } catch (reason) {
        if (active && isMapShopSetupError(reason)) { setUnlocked(1); setAvailable(false); }
      }
    }
    void load();
    const { data: listener } = supabase.auth.onAuthStateChange((event) => { if (event === "SIGNED_OUT" || event === "SIGNED_IN") { setUnlocked(1); setCurrent(1); void load(); } });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, [refresh]);

  const next = nextIsland(unlocked);
  const affordableWith = (balance: number | null) => available && balance !== null && canUnlockIsland(unlocked, balance);

  const goTo = useCallback((no: number) => { setCurrent(no); setFocus((previous) => ({ no, reveal: false, key: (previous?.key ?? 0) + 1 })); }, []);

  async function unlock(balance: number | null) {
    if (locked.current || !next || !affordableWith(balance)) return;
    locked.current = true; setBusy(true); setError("");
    try {
      const state = await unlockIsland(next.no);
      setUnlocked(state.unlocked);
      setCelebrate(next.no);
      setCurrent(next.no);
      setFocus((previous) => ({ no: next.no, reveal: true, key: (previous?.key ?? 0) + 1 }));
      onUnlocked();
      window.setTimeout(() => setCelebrate(null), 3600);
    } catch (reason) {
      setError(reason instanceof Error && reason.message.includes("INSUFFICIENT_POINTS") ? "Dir fehlen noch Punkte für diese Insel." : "Die Insel konnte nicht freigeschaltet werden. Bitte versuche es erneut.");
    } finally {
      locked.current = false; setBusy(false);
    }
  }

  return { unlocked, available, next, affordableWith, busy, error, celebrate, focus, current, goTo, unlock };
}

export type IslandsController = ReturnType<typeof useIslands>;
