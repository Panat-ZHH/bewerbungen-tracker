"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { sessionUser } from "@/lib/session-user";
import { readSnapshot, writeSnapshot, type SnapshotName } from "@/lib/snapshot-cache";

export type SnapshotCodec<T> = { encode: (data: T) => unknown; decode: (raw: unknown) => T | null };
export type SnapshotState<T> = {
  /** Fresh server data, else the user's last-known snapshot, else undefined. */
  data: T | undefined;
  /** True while `data` comes from the device snapshot (the server answer is still pending or failed). */
  stale: boolean;
  /** A server request is in flight. */
  loading: boolean;
  error: unknown;
  retry: () => void;
};

/**
 * Stale-while-revalidate for a logged-in screen (reel fix 2): shows the snapshot of the local session's user at once, always
 * loads from the server, then replaces it silently and stores the new snapshot. A failed refresh keeps the snapshot (the page
 * shows its usual error). Rendering still happens inside the workspace shell, which gates role / access first.
 */
export function useSnapshotData<T>(name: SnapshotName, load: () => Promise<T>, codec: SnapshotCodec<T>): SnapshotState<T> {
  const [state, setState] = useState<Omit<SnapshotState<T>, "retry">>({ data: undefined, stale: false, loading: true, error: null });
  const [attempt, setAttempt] = useState(0);
  const fresh = useRef(false);

  useEffect(() => {
    let alive = true;
    sessionUser().then((user) => {
      if (!alive || fresh.current || !user) return;
      const snapshot = readSnapshot(user.id, name, codec.decode);
      if (snapshot) setState((current) => (fresh.current ? current : { ...current, data: snapshot.data, stale: true }));
    }).catch(() => undefined);
    return () => { alive = false; };
  }, [name, codec]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const before = await sessionUser().catch(() => null);
      try {
        const data = await load();
        if (alive) { fresh.current = true; setState({ data, stale: false, loading: false, error: null }); }
        // Only store it when the same user is still signed in (a sign-out in between already cleared all snapshots).
        const after = await sessionUser().catch(() => null);
        if (before && after?.id === before.id) writeSnapshot(before.id, name, codec.encode(data));
      } catch (error) {
        if (alive) setState((current) => ({ ...current, loading: false, error }));
      }
    })();
    return () => { alive = false; };
  }, [attempt, name, load, codec]);

  const retry = useCallback(() => { setState((current) => ({ ...current, loading: true, error: null })); setAttempt((n) => n + 1); }, []);
  return { ...state, retry };
}
