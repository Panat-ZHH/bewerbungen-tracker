"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getIslands, unlockIsland } from "@/lib/islands-storage";
import { canUnlockIsland, nextIsland } from "@/lib/islands";
import { isMapShopSetupError } from "@/lib/map-shop";
import { supabase } from "@/lib/supabase";

export type IslandFocus = { no: number; reveal: boolean; key: number };

/**
 * Unlocked islands for the current user. Without the islands migration only the free first island exists (fallback).
 * `watchUnlocked` (parent watching a child's village, read-only): the island count comes from family_child_village; nothing
 * is loaded and nothing can be unlocked, switching between the islands still works.
 */
export function useIslands(refresh: number, onUnlocked: () => void, watchUnlocked?: number) {
  const watching = watchUnlocked !== undefined;
  const [ownUnlocked, setUnlocked] = useState(1);
  const unlocked = watching ? Math.max(1, watchUnlocked) : ownUnlocked;
  const [available, setAvailable] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [celebrate, setCelebrate] = useState<number | null>(null);
  const [focus, setFocus] = useState<IslandFocus | null>(null);
  const [current, setCurrent] = useState(1);
  const locked = useRef(false);

  useEffect(() => {
    if (watching) return;
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
  }, [refresh, watching]);

  const next = nextIsland(unlocked);
  const affordableWith = (balance: number | null) => !watching && available && balance !== null && canUnlockIsland(unlocked, balance);

  const goTo = useCallback((no: number) => { setCurrent(no); setFocus((previous) => ({ no, reveal: false, key: (previous?.key ?? 0) + 1 })); }, []);

  async function unlock(balance: number | null) {
    if (watching || locked.current || !next || !affordableWith(balance)) return;
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

  return { unlocked, available: available && !watching, watching, next, affordableWith, busy, error, celebrate, focus, current, goTo, unlock };
}

export type IslandsController = ReturnType<typeof useIslands>;
