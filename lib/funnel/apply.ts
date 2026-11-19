// Saves the funnel answers once a session exists (SPEC-DATA §3.1 step 6, §3.3). Owner: onb-data.
// Shared computers (QA-ONB M1): a local copy is only ever sent for an account that has no sign-up copy of its own and was created
// after that funnel started; everything else uses the account's own server copy or nothing (pickFunnelSource).
// Runs in /auth/callback (before resolveLanding, with the saving UI), /login after a password login, the `nach=google`
// final screen and once per app start (only when a local copy or the metadata copy `wa_funnel` exists – zero cost otherwise).
// Idempotent: funnel_apply applies once per account; a second call returns already_done.
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { isRateLimited } from "@/lib/rate-limit-text";
import { searchPrefill } from "@/lib/onboarding-core";
import { writeGoal } from "@/lib/rewards-core";
import { PENDING_SIGNUP_KEY } from "@/lib/family-core";
import type { ApplyOutcome, FunnelApplyResult, FunnelPayloadV1, FunnelStateV1 } from "./types.ts";
import { toPayload, validatePayload } from "./validate.ts";
import { clearConfirmRecord, clearFunnelState, readFunnelState } from "./storage.ts";
import { funnelRedirect } from "./next.ts";

/** Same key as lib/onboarding.ts PREFILL_KEY (not imported: lib/onboarding imports lib/role, which imports this lazily). */
const PREFILL_KEY = "wendapply.onboarding.prefill";

/** Does this user have answers waiting (local copy or the sign-up metadata copy)? */
export function hasPendingFunnel(user: Pick<User, "user_metadata"> | null | undefined): boolean {
  if (!user) return false;
  const meta = user.user_metadata as Record<string, unknown> | undefined;
  return readFunnelState() !== null || (!!meta?.wa_funnel && typeof meta.wa_funnel === "object");
}

/** Maps an RPC error to the UI kind (texts in SPEC-FLOW §4.7 / SPEC-DATA §3.4). */
export function applyErrorKind(error: unknown): "rate_limit" | "invalid" | "network" | "unknown" {
  if (isRateLimited(error)) return "rate_limit";
  const msg = String((error as { message?: unknown } | null)?.message ?? error ?? "");
  if (/INVALID_FUNNEL/.test(msg)) return "invalid";
  if (/fetch|network|Failed to|timeout|NetworkError/i.test(msg)) return "network";
  return "unknown";
}

function parseResult(data: unknown): FunnelApplyResult | null {
  const r = data as Record<string, unknown> | null;
  if (!r || typeof r !== "object") return null;
  const role = r.role === "parent" || r.role === "teacher" || r.role === "school_admin" ? r.role : "student";
  if (r.applied === true) return { applied: true, role, role_mismatch: r.role_mismatch === true, under_16: r.under_16 === true };
  if (r.reason === "already_done" || r.reason === "not_new" || r.reason === "no_answers") return { applied: false, reason: r.reason, role };
  return null;
}

function clearLocal() {
  clearFunnelState();
  clearConfirmRecord();
  for (const kind of ["sessionStorage", "localStorage"] as const) {
    try { window[kind].removeItem(PENDING_SIGNUP_KEY); } catch { /* blocked */ }
  }
}

/** The metadata copy as a payload (for the local prefill / goal cache after a server-copy save), or null. */
function metaPayload(meta: Record<string, unknown> | undefined): FunnelPayloadV1 | null {
  const p = meta?.wa_funnel;
  return p && typeof p === "object" && validatePayload(p).ok ? (p as FunnelPayloadV1) : null;
}

/** Local side effects after a successful save: search prefill, weekly-goal cache. */
function applyLocally(state: FunnelStateV1 | null, payload: FunnelPayloadV1 | null) {
  try {
    if (payload?.role === "student" && !payload.skipped) {
      const prefill = searchPrefill({ professions: payload.professions ?? [], canton: payload.canton ?? "", place: payload.place ?? "", startYear: payload.startYear ?? null });
      if (prefill) window.localStorage.setItem(PREFILL_KEY, JSON.stringify(prefill));
      if (payload.weeklyGoal) writeGoal(payload.weeklyGoal);
    }
  } catch { /* storage blocked */ }
  void state;
}

/** A local copy may belong to someone else (shared computer): it only counts for an account created after that funnel started. */
export const LOCAL_COPY_SLACK_MS = 60_000;

/**
 * Which copy of the answers is sent (QA-ONB M1 – shared computer). Pure, unit-tested.
 * - The account has its own sign-up copy (`wa_funnel` metadata) → always the server copy (`p_answers: null`); the local copy
 *   is ignored (it may be another person's) and cleared after the call.
 * - No metadata (Google sign-up): the local copy only if the account was created after this funnel started
 *   (`created_at >= startedAt − 60 s`), or if `explicit` = the signed-in user is pressing «Plan speichern» / «Überspringen»
 *   in the authenticated funnel right now (`/start?…&nach=google`, answers typed after the account existed). Otherwise the
 *   local copy is cleared and nothing is sent.
 * `ownLocal` = the local copy may drive the redirect after the save (class code, family step, invite).
 */
export type FunnelSource =
  | { kind: "server"; ownLocal: boolean }
  | { kind: "local"; payload: FunnelPayloadV1; ownLocal: true }
  | { kind: "none"; clearLocal: boolean };

export function pickFunnelSource(input: {
  hasMeta: boolean; local: FunnelStateV1 | null; createdAt: string | null | undefined; explicit: boolean;
  skipped?: boolean; role?: FunnelStateV1["role"];
}): FunnelSource {
  const { hasMeta, local, explicit } = input;
  const created = Date.parse(input.createdAt ?? "");
  const localIsOlderThanAccount = !!local && Number.isFinite(created) && created >= local.startedAt - LOCAL_COPY_SLACK_MS;
  const ownLocal = !!local && (explicit || localIsOlderThanAccount);
  if (hasMeta) return { kind: "server", ownLocal };
  if (input.skipped) {
    // «Überspringen» on the cross-device notice: an explicit action of the signed-in user (role only).
    if (!explicit && !ownLocal) return { kind: "none", clearLocal: !!local };
    const role = input.role ?? local?.role ?? null;
    return role ? { kind: "local", payload: { v: 1, role, skipped: true }, ownLocal: true } : { kind: "none", clearLocal: false };
  }
  if (!local) return { kind: "none", clearLocal: false };
  if (!ownLocal) return { kind: "none", clearLocal: true };
  const payload = toPayload(local);
  // A local copy that is not complete/valid (abandoned half-way) is not sent.
  if (!payload || !validatePayload(payload).ok) return { kind: "none", clearLocal: true };
  return { kind: "local", payload, ownLocal: true };
}

/** The authenticated funnel (`/start?…&nach=google`) saving on a click of the signed-in user (not an implicit login/app-start save). */
function inAuthenticatedFunnel(): boolean {
  try {
    if (typeof window === "undefined" || !window.location) return false;
    return window.location.pathname === "/start" && new URLSearchParams(window.location.search).get("nach") === "google";
  } catch { return false; }
}

/** Does the server role match the role the local copy chose? (a local redirect only for the same role) */
function sameRole(local: FunnelStateV1 | null, role: FunnelApplyResult["role"]): boolean {
  if (!local?.role) return false;
  if (local.role === "staff") return role === "teacher" || role === "school_admin";
  return local.role === role;
}

/**
 * Sends the pending answers – the account's own metadata copy first (p_answers = null), else a local copy that belongs to this
 * account (see pickFunnelSource). `opts.skipped` = «Überspringen» on the cross-device notice (role only). Never throws.
 */
export async function applyFunnelIfPending(opts: { user?: User | null; skipped?: boolean; role?: FunnelStateV1["role"] } = {}): Promise<ApplyOutcome> {
  let user = opts.user ?? null;
  if (!user) { try { user = (await supabase.auth.getUser()).data.user; } catch { user = null; } }
  if (!user) return { status: "none" };
  const local = readFunnelState();
  const meta = user.user_metadata as Record<string, unknown> | undefined;
  const hasMeta = !!meta?.wa_funnel && typeof meta.wa_funnel === "object";

  const source = pickFunnelSource({ hasMeta, local, createdAt: user.created_at, explicit: inAuthenticatedFunnel(), skipped: opts.skipped, role: opts.role });
  if (source.kind === "none") { if (source.clearLocal) clearLocal(); return { status: "none" }; }
  const payload: FunnelPayloadV1 | null = source.kind === "local" ? source.payload : null;
  const ownLocal = source.ownLocal ? local : null;

  let data: unknown; let error: unknown;
  try { ({ data, error } = await supabase.rpc("funnel_apply", { p_answers: payload })); } catch (e) { error = e; }
  if (error) return { status: "error", kind: applyErrorKind(error) };
  const result = parseResult(data);
  if (!result) return { status: "error", kind: "unknown" };

  // The metadata copy is never needed again (applied or not): clear it. Routing sugar for the old role logic too.
  const serverRole = result.role === "teacher" || result.role === "school_admin" ? "teacher" : "student";
  const update: Record<string, unknown> = { wa_funnel: null };
  if (result.applied) {
    update.role = serverRole; update.role_confirmed = true;
    if (result.role === "parent") { update.account_type = "parent"; update.account_type_synced = true; }
    else if (result.role === "student") update.account_type_synced = true;
  }
  if (result.applied || hasMeta) { try { await supabase.auth.updateUser({ data: update }); } catch { /* next start */ } }

  if (result.applied) {
    // Local side effects only from this account's own answers: the sent payload, or (server copy) the metadata copy.
    applyLocally(ownLocal, payload ?? metaPayload(meta) ?? (ownLocal ? toPayload(ownLocal) : null));
    const redirect = ownLocal && sameRole(ownLocal, result.role) ? funnelRedirect(ownLocal) : null;
    clearLocal();
    return { status: "applied", result, redirect };
  }
  clearLocal();
  return { status: "skipped", result };
}
