// Browser storage of the funnel answers (SPEC-DATA §2.2, SPEC-FLOW §4.1). Owner: onb-data; used by components/funnel/**.
// localStorage `wendapply.funnel.v1` (answers, never e-mail/password/tokens) with an in-memory fallback when storage is blocked
// (Safari private mode, storage disabled): the funnel then still works in this tab, only resume is lost.
// sessionStorage `wendapply.funnel.confirm` holds `{ email, at }` for /start/bestaetigen – the only place an e-mail is kept.
import { FUNNEL_CONFIRM_KEY, FUNNEL_KEY, type FunnelConfirmRecord, type FunnelStateV1 } from "./types.ts";
import { parseFunnelState } from "./validate.ts";
import { funnelNextPath } from "./next.ts";

let memory: FunnelStateV1 | null = null;
let memoryConfirm: FunnelConfirmRecord | null = null;

function store(kind: "local" | "session"): Storage | null {
  try { return typeof window === "undefined" ? null : kind === "local" ? window.localStorage : window.sessionStorage; } catch { return null; }
}
const isSafeNext = (n: string) => funnelNextPath(n) !== null;

/** The saved answers (valid shape, within TTL) or null. Expired / malformed copies are removed. */
export function readFunnelState(now = Date.now()): FunnelStateV1 | null {
  const s = store("local");
  let raw: string | null = null;
  try { raw = s?.getItem(FUNNEL_KEY) ?? null; } catch { raw = null; }
  if (raw === null) return memory ? parseFunnelState(memory, now, isSafeNext) : null;
  const parsed = parseFunnelState(raw, now, isSafeNext);
  if (!parsed) { try { s?.removeItem(FUNNEL_KEY); } catch { /* ignore */ } }
  return parsed;
}

/** Saves the answers (sets updatedAt). Only the known state keys are written (parseFunnelState rebuilds the object), so an
 *  e-mail, password or token accidentally spread into the state never reaches localStorage. */
export function writeFunnelState(state: FunnelStateV1, now = Date.now()): void {
  const next = parseFunnelState({ ...state, updatedAt: now }, now, isSafeNext);
  if (!next) return;
  memory = next;
  try { store("local")?.setItem(FUNNEL_KEY, JSON.stringify(next)); } catch { /* full / blocked: memory copy stays */ }
}

/** Deletes the answers (after a successful save, «Neu beginnen», login with an existing account). */
export function clearFunnelState(): void {
  memory = null;
  try { store("local")?.removeItem(FUNNEL_KEY); } catch { /* ignore */ }
}
export function hasFunnelState(now = Date.now()): boolean { return readFunnelState(now) !== null; }

/** Is storage usable at all? (false → no resume card; the funnel works in memory) */
export function funnelStorageAvailable(): boolean {
  const s = store("local");
  if (!s) return false;
  try { const k = `${FUNNEL_KEY}.probe`; s.setItem(k, "1"); s.removeItem(k); return true; } catch { return false; }
}

// ---- confirmation page record (sessionStorage only) ----
export function writeConfirmRecord(email: string, now = Date.now()): void {
  const rec: FunnelConfirmRecord = { email: String(email).trim().slice(0, 320), at: now };
  memoryConfirm = rec;
  try { store("session")?.setItem(FUNNEL_CONFIRM_KEY, JSON.stringify(rec)); } catch { /* memory copy stays */ }
}
/** The record if it is at most 24 h old, else null. */
export function readConfirmRecord(now = Date.now()): FunnelConfirmRecord | null {
  let v: unknown = memoryConfirm;
  try { const raw = store("session")?.getItem(FUNNEL_CONFIRM_KEY); if (raw) v = JSON.parse(raw); } catch { /* ignore */ }
  const r = v as Partial<FunnelConfirmRecord> | null;
  if (!r || typeof r.email !== "string" || !r.email.includes("@") || typeof r.at !== "number") return null;
  if (now - r.at > 24 * 3600 * 1000 || r.at > now + 60_000) return null;
  return { email: r.email, at: r.at };
}
export function clearConfirmRecord(): void {
  memoryConfirm = null;
  try { store("session")?.removeItem(FUNNEL_CONFIRM_KEY); } catch { /* ignore */ }
}

// ---- «Mit Google weiter» started in the funnel (QA-ONB-2 N1, sessionStorage only) ----
// The funnel's own Google button writes `startedAt` of the copy it signs up with; /login's Google button removes it. sessionStorage
// survives the same-tab OAuth round trip and is per tab, so another person's /login tab never carries it. No memory fallback on
// purpose: blocked storage = no marker = the local copy is not trusted for a new Google account (privacy first).
export const FUNNEL_OAUTH_KEY = "wendapply.funnel.oauth";
export function markFunnelOAuth(startedAt: number): void {
  try { store("session")?.setItem(FUNNEL_OAUTH_KEY, String(startedAt)); } catch { /* blocked: no marker */ }
}
/** The marker value (a startedAt) or null. */
export function readFunnelOAuth(): number | null {
  let raw: string | null = null;
  try { raw = store("session")?.getItem(FUNNEL_OAUTH_KEY) ?? null; } catch { raw = null; }
  if (raw === null || !/^\d{1,16}$/.test(raw)) return null;
  return Number(raw);
}
export function clearFunnelOAuth(): void {
  try { store("session")?.removeItem(FUNNEL_OAUTH_KEY); } catch { /* ignore */ }
}
