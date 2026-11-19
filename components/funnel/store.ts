"use client";
// Single seam between the funnel UI and the data layer of onb-data (lib/funnel/*). Every storage / payload / save call of
// the UI goes through here, so updating to a newer lib/funnel API only touches this file.
import { FUNNEL_CONFIRM_KEY, FUNNEL_KEY, FUNNEL_TTL_MS, type ApplyOutcome, type FunnelConfirmRecord, type FunnelPayloadV1, type FunnelStateV1 } from "@/lib/funnel/types";
import { safeNextPath } from "@/lib/ux";
import * as validate from "@/lib/funnel/validate";
import * as apply from "@/lib/funnel/apply";
import { funnelNextPath } from "@/lib/funnel/next";
import { emptyFunnelState, isStepSlug, parseConfirmRecord } from "./funnel-core";

// In-memory fallback when storage is blocked (Safari private mode, storage disabled): the funnel still works, resume never shows.
let memory: string | null = null;
let memoryConfirm: string | null = null;

function local(): Storage | null { try { return typeof window === "undefined" ? null : window.localStorage; } catch { return null; } }
function session(): Storage | null { try { return typeof window === "undefined" ? null : window.sessionStorage; } catch { return null; } }

const ROLES = ["student", "parent", "staff"];
const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

/** Saved answers, or null (missing, malformed, other version, older than 14 days, `updatedAt` in the future). */
export function loadFunnelState(now = Date.now()): FunnelStateV1 | null {
  let raw: string | null = null;
  try { raw = local()?.getItem(FUNNEL_KEY) ?? memory; } catch { raw = memory; }
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<FunnelStateV1>;
    if (!v || v.v !== 1 || typeof v.updatedAt !== "number" || typeof v.startedAt !== "number") return null;
    if (v.updatedAt > now + 60_000 || now - v.updatedAt > FUNNEL_TTL_MS) { clearFunnelState(); return null; }
    const base = emptyFunnelState(v.startedAt);
    const list = (x: unknown, max: number) => (Array.isArray(x) ? x.filter((i): i is string => typeof i === "string").map((i) => i.slice(0, 60)).slice(0, max) : []);
    const year = (x: unknown) => (typeof x === "number" && Number.isInteger(x) ? x : null);
    return {
      ...base,
      updatedAt: v.updatedAt,
      step: isStepSlug(v.step) ? v.step : "weg",
      next: typeof v.next === "string" ? safeNextPath(v.next) : null,
      role: ROLES.includes(v.role as string) ? (v.role as FunnelStateV1["role"]) : null,
      firstName: str(v.firstName, 80), birthYear: year(v.birthYear), schoolLevel: str(v.schoolLevel, 60), classCode: str(v.classCode, 16),
      canton: str(v.canton, 2), place: str(v.place, 80), professions: list(v.professions, 3), unsure: v.unsure === true, startYear: year(v.startYear),
      weeklyGoal: typeof v.weeklyGoal === "number" && Number.isInteger(v.weeklyGoal) && v.weeklyGoal >= 1 && v.weeklyGoal <= 10 ? v.weeklyGoal : 3,
      help: list(v.help, 5),
      family: v.family === "jetzt" || v.family === "spaeter" ? v.family : null,
      parentKid: v.parentKid === "einladen" || v.parentKid === "code" || v.parentKid === "spaeter" ? v.parentKid : null,
      inviteCode: str(v.inviteCode, 8),
      staffAccess: v.staffAccess === "licence" || v.staffAccess === "pilot" || v.staffAccess === "admin" ? v.staffAccess : null,
    };
  } catch { return null; }
}

/** Writes the answers (never e-mail, password or tokens – the state type has no such field). */
export function saveFunnelState(state: FunnelStateV1) {
  const raw = JSON.stringify(state);
  memory = raw;
  try { local()?.setItem(FUNNEL_KEY, raw); } catch { /* full / blocked: memory only */ }
}

export function clearFunnelState() {
  memory = null;
  try { local()?.removeItem(FUNNEL_KEY); } catch { /* ignore */ }
}

/** True when storage works (resume card only makes sense then). */
export function storageAvailable(): boolean {
  try { const s = local(); if (!s) return false; s.setItem("wendapply.funnel.probe", "1"); s.removeItem("wendapply.funnel.probe"); return true; } catch { return false; }
}

// ---- confirm record (sessionStorage only) ----
export function readConfirmRecord(): FunnelConfirmRecord | null {
  let raw: string | null = null;
  try { raw = session()?.getItem(FUNNEL_CONFIRM_KEY) ?? memoryConfirm; } catch { raw = memoryConfirm; }
  return parseConfirmRecord(raw);
}
export function writeConfirmRecord(record: FunnelConfirmRecord) {
  const raw = JSON.stringify({ email: record.email, at: record.at });
  memoryConfirm = raw;
  try { session()?.setItem(FUNNEL_CONFIRM_KEY, raw); } catch { /* memory only */ }
}
export function clearConfirmRecord() { memoryConfirm = null; try { session()?.removeItem(FUNNEL_CONFIRM_KEY); } catch { /* ignore */ } }

// ---- payload + save (lib/funnel/validate + lib/funnel/apply of onb-data) ----

/** Validated server payload of the current role, or the failing field. */
export function buildPayload(state: FunnelStateV1): { ok: true; payload: FunnelPayloadV1 } | { ok: false; field: string } {
  return validate.payloadFromState(state);
}

/** Saves pending answers (local copy or the metadata copy) once a session exists. Never throws. */
export async function applyPending(): Promise<ApplyOutcome> {
  try { return await apply.applyFunnelIfPending(); } catch { return { status: "error", kind: "unknown" }; }
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
