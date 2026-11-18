import { supabase } from "@/lib/supabase";
import { sessionUser } from "@/lib/session-user";

/**
 * Perf (reel waterfall, 2026-11-18): the shell (tab bar), the class list and the class goals each asked class_my_classes at the
 * same moment of a page load. Callers that ask while a read for the same user is still running share it; nothing is kept after
 * it finished (no cache), and a class change of this tab (join / leave / sharing) starts a fresh read. Every caller still
 * handles `error` itself, exactly as before.
 */
export type MyClassesAnswer = { data: unknown; error: { code?: string; message?: string; details?: string | null; hint?: string | null } | null };
let running: { userId: string | null; promise: Promise<MyClassesAnswer> } | null = null;

export async function readMyClasses(): Promise<MyClassesAnswer> {
  const userId = (await sessionUser().catch(() => null))?.id ?? null;
  if (running && running.userId === userId) return running.promise;
  const promise = Promise.resolve(supabase.rpc("class_my_classes")).then(({ data, error }) => ({ data, error }));
  const entry = { userId, promise };
  running = entry;
  promise.finally(() => { if (running === entry) running = null; }).catch(() => undefined);
  return promise;
}

/** A class membership changed (or is about to): later readers must not join a read that started before. */
export function forgetMyClassesRead() { running = null; }

/** Runs a class change and makes sure no later read joins one that started before or during it. */
export async function classChange<T>(change: () => Promise<T>): Promise<T> {
  forgetMyClassesRead();
  try { return await change(); } finally { forgetMyClassesRead(); }
}
