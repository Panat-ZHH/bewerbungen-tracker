// Client side of the access model (docs/access/SPEC.md §6): my_access() with a per-session cache, refresh on focus and after
// a billing return, and a watcher that turns any PAYWALL answer (Postgres 'PAYWALL' or HTTP 402) into the paywall.
import { supabase } from "@/lib/supabase";
import { isMissingFamilyFeature } from "@/lib/family-core";
import { isPaywallError, OPEN_ACCESS, readAccessInfo } from "./gate";
import type { AccessInfo } from "./types";

export const ACCESS_CHANGED_EVENT = "wa:access-changed";
export const PAYWALL_EVENT = "wa:paywall";
/** Re-read at most this often on focus (a billing return / paywall error always re-reads). */
const FOCUS_TTL_MS = 60_000;

type Cached = { userId: string; info: AccessInfo; at: number };
let cache: Cached | null = null;
let inflight: { userId: string; promise: Promise<AccessInfo> } | null = null;

export function clearAccessCache() { cache = null; inflight = null; }
export function cachedAccess(userId?: string | null): AccessInfo | null { return cache && (!userId || cache.userId === userId) ? cache.info : null; }

/**
 * my_access() of the signed-in user. Old database without the function (PGRST202 …) = feature not deployed = full access,
 * no UI. Any other error (offline, 5xx) also falls back to full access: the server (RLS) is the real gate, the UI must never
 * lock somebody out because a read failed.
 */
export async function loadMyAccess(opts: { force?: boolean; userId?: string | null } = {}): Promise<AccessInfo> {
  let userId = opts.userId ?? null;
  if (!userId) { const { data } = await supabase.auth.getSession(); userId = data.session?.user.id ?? null; }
  if (!userId) return OPEN_ACCESS;
  if (!opts.force && cache?.userId === userId) return cache.info;
  if (!opts.force && inflight?.userId === userId) return inflight.promise;
  const promise = (async () => {
    try {
      const { data, error } = await supabase.rpc("my_access");
      if (error) return OPEN_ACCESS;
      return readAccessInfo(data) ?? OPEN_ACCESS;
    } catch { return OPEN_ACCESS; }
  })().then((info) => {
    cache = { userId: userId!, info, at: Date.now() };
    if (inflight?.promise === promise) inflight = null;
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(ACCESS_CHANGED_EVENT, { detail: info }));
    return info;
  });
  inflight = { userId, promise };
  return promise;
}

/** True when the cached value is older than the focus TTL. */
export function accessIsStale(now = Date.now()) { return !cache || now - cache.at > FOCUS_TTL_MS; }

/** Exposed for tests / the e2e: was the RPC simply not deployed? */
export const isAccessFeatureMissing = (error: unknown) => isMissingFamilyFeature(error);

/** Tell the app that the server refused something because of the paywall (it re-reads my_access and shows the paywall). */
export function reportPaywall() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(PAYWALL_EVENT));
}

/** Call with any error: if it is a PAYWALL error, the paywall is shown. Returns true when it was one. */
export function handlePaywallError(error: unknown): boolean {
  if (!isPaywallError(error)) return false;
  reportPaywall();
  return true;
}

let watcherInstalled = false;
/**
 * Watches every fetch of this tab once: a 402 from our API or a Supabase REST/RPC/storage answer with message 'PAYWALL'
 * reports the paywall, so pages need no special code. Bodies are only cloned for 4xx answers.
 */
export function installPaywallWatcher() {
  if (watcherInstalled || typeof window === "undefined" || typeof window.fetch !== "function") return;
  watcherInstalled = true;
  const original = window.fetch.bind(window);
  window.fetch = async (...args: Parameters<typeof fetch>) => {
    const response = await original(...args);
    try {
      if (response.status === 402) reportPaywall();
      else if (response.status >= 400 && response.status < 500 && response.status !== 404) {
        const url = typeof args[0] === "string" ? args[0] : args[0] instanceof URL ? args[0].href : (args[0] as Request).url;
        if (/\/(rest|storage)\/v1\//.test(url)) {
          response.clone().text().then((text) => { if (/\bPAYWALL\b/.test(text)) reportPaywall(); }).catch(() => {});
        }
      }
    } catch { /* never break the request */ }
    return response;
  };
}
