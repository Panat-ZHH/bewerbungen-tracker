"use client";
// Single seam between the funnel UI and the data layer of onb-data (lib/funnel/*). Every storage / payload / save call of
// the UI goes through here, so updating to a newer lib/funnel API only touches this file.
import type { ApplyOutcome, FunnelConfirmRecord, FunnelPayloadV1, FunnelStateV1 } from "@/lib/funnel/types";
import * as storage from "@/lib/funnel/storage";
import * as validate from "@/lib/funnel/validate";
import * as apply from "@/lib/funnel/apply";
import { funnelNextPath } from "@/lib/funnel/next";

/** Saved answers, or null (missing, malformed, other version, older than 14 days). Same parser as the save path. */
export function loadFunnelState(now = Date.now()): FunnelStateV1 | null { return storage.readFunnelState(now); }

/** Writes the answers (never e-mail, password or tokens – the state type has no such field). Keeps the given `updatedAt`. */
export function saveFunnelState(state: FunnelStateV1) { storage.writeFunnelState(state, state.updatedAt || Date.now()); }

export function clearFunnelState() { storage.clearFunnelState(); }

/** True when storage works (resume card only makes sense then). */
export function storageAvailable(): boolean { return storage.funnelStorageAvailable(); }

// ---- confirm record (sessionStorage only) ----
export function readConfirmRecord(): FunnelConfirmRecord | null { return storage.readConfirmRecord(); }
export function writeConfirmRecord(record: FunnelConfirmRecord) { storage.writeConfirmRecord(record.email, record.at); }
export function clearConfirmRecord() { storage.clearConfirmRecord(); }

// ---- payload + save (lib/funnel/validate + lib/funnel/apply of onb-data) ----

/** Validated server payload of the current role, or the failing field. */
export function buildPayload(state: FunnelStateV1): { ok: true; payload: FunnelPayloadV1 } | { ok: false; field: string } {
  return validate.payloadFromState(state);
}

/**
 * Saves pending answers (local copy or the metadata copy) once a session exists. Never throws.
 * `skipped` = «Überspringen» on the cross-device notice: only the role is saved (SPEC-DATA §3.2).
 */
export async function applyPending(opts: { skipped?: boolean; role?: FunnelStateV1["role"] } = {}): Promise<ApplyOutcome> {
  try { return await apply.applyFunnelIfPending(opts); } catch { return { status: "error", kind: "unknown" }; }
}

/**
 * `emailRedirectTo` / OAuth `redirectTo`: always this origin + /auth/callback, with the allow-listed `next` (SPEC-DATA §3.7).
 * `email: true` marks the sign-up / resend link so the callback can tell «confirmed in another browser» from an OAuth hiccup.
 */
export function callbackUrl(next: string | null | undefined, opts: { email?: boolean } = {}): string {
  const q = new URLSearchParams();
  const safe = funnelNextPath(next ?? null);
  if (safe) q.set("next", safe);
  if (opts.email) q.set("quelle", "email");
  const qs = q.toString();
  return `${window.location.origin}/auth/callback${qs ? `?${qs}` : ""}`;
}
