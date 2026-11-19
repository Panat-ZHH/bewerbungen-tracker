// Saves the funnel answers once a session exists (SPEC-DATA §3.1 step 6, §3.3). Owner: onb-data.
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

/**
 * Sends the pending answers (local copy first, else the server reads its own metadata copy with p_answers = null).
 * `opts.skipped` = «Überspringen» on the cross-device notice (role only). Never throws.
 */
export async function applyFunnelIfPending(opts: { user?: User | null; skipped?: boolean; role?: FunnelStateV1["role"] } = {}): Promise<ApplyOutcome> {
  let user = opts.user ?? null;
  if (!user) { try { user = (await supabase.auth.getUser()).data.user; } catch { user = null; } }
  if (!user) return { status: "none" };
  const local = readFunnelState();
  const meta = user.user_metadata as Record<string, unknown> | undefined;
  const hasMeta = !!meta?.wa_funnel && typeof meta.wa_funnel === "object";

  let payload: FunnelPayloadV1 | null = null;
  if (opts.skipped) {
    const role = opts.role ?? local?.role ?? null;
    if (!role) return { status: "none" };
    payload = { v: 1, role, skipped: true };
  } else if (local) {
    payload = toPayload(local);
    // A local copy that is not complete/valid (abandoned half-way) is not sent; the metadata copy may still be there.
    if (payload && !validatePayload(payload).ok) payload = null;
    if (!payload && !hasMeta) { clearFunnelState(); return { status: "none" }; }
  } else if (!hasMeta) return { status: "none" };

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
    applyLocally(local, payload ?? null);
    const redirect = local ? funnelRedirect(local) : null;
    clearLocal();
    return { status: "applied", result, redirect };
  }
  clearLocal();
  return { status: "skipped", result };
}
