// Pure validators of the sign-up funnel (SPEC-DATA §2.2, §3.4). No browser/Supabase imports: node --test loads this directly.
// validatePayload() is an EXACT mirror of funnel_apply() in supabase/migrations/20261119100000_onboarding_funnel.sql
// (same rules, same order, same field names) – the server is the authority, this only lets the funnel show errors first.
import { SCHOOL_LEVELS } from "../onboarding-core.ts";
import { CANTON_CODES } from "../geo/cantons.ts";
import {
  FAMILY_CHOICES, FUNNEL_LIMITS, FUNNEL_ROLES, FUNNEL_TTL_MS, HELP_PARENT, HELP_STUDENT, PARENT_KID_CHOICES, PAYLOAD_KEYS,
  STAFF_ACCESS_CHOICES, type FunnelField, type FunnelPayloadV1, type FunnelRole, type FunnelStateV1, type ValidationResult,
} from "./types.ts";

/**
 * Invisible / direction-changing characters removed before any check (same set as sec-release's _strip_invisible_columns and
 * public._funnel_clean): C0 controls, DEL, ALM, MVS, ZWSP, LRM/RLM, bidi embeddings/overrides/isolates, word joiner + invisible
 * operators, BOM, interlinear annotation. ZWJ (emoji sequences) and ZWNJ (Persian, Indic) are kept.
 */
export const INVISIBLE = /[\u0001-\u001F\u007F؜᠎​‎‏‪-‮⁠-⁤⁦-⁩﻿￹-￻]/g;
/** Other control characters that survive the strip (C1 range, NUL): the server refuses them (`[[:cntrl:]]`). */
const CONTROL = /[\u0000\u0080-\u009F]/;
const LETTER = /\p{L}/u;

/** Strip invisible characters, collapse whitespace, trim – what the server stores. */
export function cleanText(value: string): string {
  return String(value ?? "").replace(INVISIBLE, "").replace(/\s+/g, " ").trim();
}
/** Length in code points (= Postgres char_length). */
export const charLength = (value: string) => [...value].length;

export const isSchoolLevel = (v: unknown): v is string => typeof v === "string" && (SCHOOL_LEVELS as readonly string[]).includes(v);
export const isCanton = (v: unknown): v is string => typeof v === "string" && CANTON_CODES.includes(v);
const isRole = (v: unknown): v is FunnelRole => typeof v === "string" && (FUNNEL_ROLES as readonly string[]).includes(v);
const oneOf = <T extends string>(v: unknown, list: readonly T[]): v is T => typeof v === "string" && (list as readonly string[]).includes(v);
/** A JSON number that Postgres prints as exactly n digits (no fraction, no exponent, not negative). */
const digits = (v: unknown, min: number, max: number) => typeof v === "number" && Number.isInteger(v) && v >= 0 && String(v).length >= min && String(v).length <= max;
const nullish = (v: unknown) => v === undefined || v === null;

/** Year bounds (server: current_date year). */
export function birthYearRange(now: Date = new Date()) { const y = now.getFullYear(); return { min: y - 100, max: y - 8 }; }
export function startYearRange(now: Date = new Date()) { const y = now.getFullYear(); return { min: y - 1, max: y + 4 }; }

/** First name rule (all roles): 1–40 characters after cleaning, no control characters, at least one letter. */
export function firstNameProblem(raw: unknown): boolean {
  if (typeof raw !== "string") return true;
  const v = cleanText(raw);
  return charLength(v) < 1 || charLength(v) > FUNNEL_LIMITS.firstName || CONTROL.test(v) || !LETTER.test(v);
}
/** Professions: dedupe case-insensitively (first spelling wins), cleaned. */
export function dedupeProfessions(list: string[]): string[] {
  const seen = new Set<string>(); const out: string[] = [];
  for (const raw of list) { const v = cleanText(raw); const key = v.toLowerCase(); if (!v || seen.has(key)) continue; seen.add(key); out.push(v); }
  return out;
}

/** Mirror of funnel_apply's validation. `now` decides the year bounds. */
export function validatePayload(p: unknown, now: Date = new Date()): ValidationResult {
  const fail = (field: FunnelField): ValidationResult => ({ ok: false, field });
  if (!p || typeof p !== "object" || Array.isArray(p)) return fail("size");
  const a = p as Record<string, unknown>;
  let size = 0;
  try { size = new TextEncoder().encode(JSON.stringify(a)).length; } catch { return fail("size"); }
  if (size > FUNNEL_LIMITS.payloadBytes) return fail("size");
  for (const k of Object.keys(a)) if (!(PAYLOAD_KEYS as readonly string[]).includes(k)) return fail("key");
  if (a.v !== 1) return fail("v");
  if (!isRole(a.role)) return fail("role");
  if (!nullish(a.skipped) && typeof a.skipped !== "boolean") return fail("key");
  if (a.skipped === true) return { ok: true };

  if (firstNameProblem(a.firstName)) return fail("firstName");
  if (a.role === "student") {
    const by = birthYearRange(now);
    if (!digits(a.birthYear, 4, 4) || (a.birthYear as number) < by.min || (a.birthYear as number) > by.max) return fail("birthYear");
    if (!isSchoolLevel(a.schoolLevel)) return fail("schoolLevel");
    if (!isCanton(a.canton)) return fail("canton");
    if (typeof a.place === "string") {
      const place = cleanText(a.place);
      if (charLength(place) > FUNNEL_LIMITS.place || CONTROL.test(place)) return fail("place");
    } else if (!nullish(a.place)) return fail("place");
    if (!nullish(a.unsure) && typeof a.unsure !== "boolean") return fail("unsure");
    let profs: string[] = [];
    if (!nullish(a.professions)) {
      if (!Array.isArray(a.professions) || a.professions.length > FUNNEL_LIMITS.professionsMax) return fail("professions");
      for (const e of a.professions) {
        if (typeof e !== "string") return fail("professions");
        const len = charLength(cleanText(e));
        if (len < 1 || len > FUNNEL_LIMITS.profession) return fail("professions");
      }
      profs = dedupeProfessions(a.professions as string[]);
    }
    if (a.unsure === true && profs.length > 0) return fail("professions");
    if (!nullish(a.startYear)) {
      const sy = startYearRange(now);
      if (!digits(a.startYear, 4, 4) || (a.startYear as number) < sy.min || (a.startYear as number) > sy.max) return fail("startYear");
    }
    if (!digits(a.weeklyGoal, 1, 2) || (a.weeklyGoal as number) < FUNNEL_LIMITS.weeklyGoalMin || (a.weeklyGoal as number) > FUNNEL_LIMITS.weeklyGoalMax) return fail("weeklyGoal");
  }
  if ((a.role === "student" || a.role === "parent") && !nullish(a.help)) {
    if (!Array.isArray(a.help) || a.help.length > FUNNEL_LIMITS.helpMax) return fail("help");
    const allowed: readonly string[] = a.role === "student" ? HELP_STUDENT : HELP_PARENT;
    for (const e of a.help) if (typeof e !== "string" || !allowed.includes(e)) return fail("help");
  }
  return { ok: true };
}

/** Empty browser state (screen 0). */
export function emptyFunnelState(now = Date.now()): FunnelStateV1 {
  return {
    v: 1, startedAt: now, updatedAt: now, step: "weg", next: null, role: null, firstName: "", birthYear: null, schoolLevel: "",
    classCode: "", canton: "", place: "", professions: [], unsure: false, startYear: null, weeklyGoal: FUNNEL_LIMITS.weeklyGoalDefault,
    help: [], family: null, parentKid: null, inviteCode: "", staffAccess: null,
  };
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
const intOrNull = (v: unknown) => (typeof v === "number" && Number.isInteger(v) ? v : null);

/**
 * Reads the saved browser state (string from localStorage or an already parsed object). Returns null when missing, malformed,
 * of another version, from the future (> 1 day ahead) or older than the TTL. Field values are coerced to their types but NOT
 * validated against the rules (the user may be half-way) – validatePayload(toPayload(state)) decides before saving.
 * `next` is kept only when `isSafeNext` accepts it (pass funnelNextPath from lib/funnel/next.ts).
 */
export function parseFunnelState(raw: unknown, now: number = Date.now(), isSafeNext: (n: string) => boolean = () => false): FunnelStateV1 | null {
  let v: unknown = raw;
  if (typeof raw === "string") { if (raw.length > 16384) return null; try { v = JSON.parse(raw); } catch { return null; } }
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const s = v as Record<string, unknown>;
  if (s.v !== 1) return null;
  const updatedAt = Number(s.updatedAt); const startedAt = Number(s.startedAt);
  if (!Number.isFinite(updatedAt) || !Number.isFinite(startedAt)) return null;
  if (updatedAt > now + 24 * 3600 * 1000 || now - updatedAt > FUNNEL_TTL_MS) return null;
  const goal = intOrNull(s.weeklyGoal);
  return {
    v: 1, startedAt, updatedAt,
    step: typeof s.step === "string" && /^[a-z]{2,16}$/.test(s.step) ? s.step : "weg",
    next: typeof s.next === "string" && isSafeNext(s.next) ? s.next : null,
    role: isRole(s.role) ? s.role : null,
    firstName: str(s.firstName, 200),
    birthYear: intOrNull(s.birthYear),
    schoolLevel: isSchoolLevel(s.schoolLevel) ? s.schoolLevel : "",
    classCode: typeof s.classCode === "string" ? s.classCode.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, FUNNEL_LIMITS.classCodeMax) : "",
    canton: isCanton(s.canton) ? s.canton : "",
    place: str(s.place, 200),
    professions: Array.isArray(s.professions) ? s.professions.filter((x): x is string => typeof x === "string").slice(0, FUNNEL_LIMITS.professionsMax).map((x) => x.slice(0, 200)) : [],
    unsure: s.unsure === true,
    startYear: intOrNull(s.startYear),
    weeklyGoal: goal !== null && goal >= FUNNEL_LIMITS.weeklyGoalMin && goal <= FUNNEL_LIMITS.weeklyGoalMax ? goal : FUNNEL_LIMITS.weeklyGoalDefault,
    help: Array.isArray(s.help) ? [...new Set(s.help.filter((x): x is string => oneOf(x, [...HELP_STUDENT, ...HELP_PARENT])))].slice(0, FUNNEL_LIMITS.helpMax) : [],
    family: oneOf(s.family, FAMILY_CHOICES) ? s.family : null,
    parentKid: oneOf(s.parentKid, PARENT_KID_CHOICES) ? s.parentKid : null,
    inviteCode: typeof s.inviteCode === "string" ? s.inviteCode.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8) : "",
    staffAccess: oneOf(s.staffAccess, STAFF_ACCESS_CHOICES) ? s.staffAccess : null,
  };
}

/**
 * Server payload from the browser state: only the role's own keys, never the transient answers (class code, invite code, family
 * choice, staff path, step, next). Staff has no question screens → `skipped: true` (the role is all that is saved).
 * Returns null without a role. Strings are cleaned the same way the server cleans them.
 */
export function toPayload(state: FunnelStateV1, opts: { skipped?: boolean } = {}): FunnelPayloadV1 | null {
  if (!state.role) return null;
  if (opts.skipped || state.role === "staff") return { v: 1, role: state.role, skipped: true };
  const firstName = cleanText(state.firstName);
  if (state.role === "parent") {
    const help = state.help.filter((h) => (HELP_PARENT as readonly string[]).includes(h));
    return { v: 1, role: "parent", firstName, ...(help.length ? { help } : {}) };
  }
  const professions = state.unsure ? [] : dedupeProfessions(state.professions).slice(0, FUNNEL_LIMITS.professionsMax);
  const place = cleanText(state.place);
  const help = state.help.filter((h) => (HELP_STUDENT as readonly string[]).includes(h));
  return {
    v: 1, role: "student", firstName,
    ...(state.birthYear !== null ? { birthYear: state.birthYear } : {}),
    schoolLevel: state.schoolLevel, canton: state.canton,
    ...(place ? { place } : {}),
    ...(state.unsure ? { unsure: true } : {}),
    ...(professions.length ? { professions } : {}),
    ...(professions.length && state.startYear !== null ? { startYear: state.startYear } : {}),
    weeklyGoal: state.weeklyGoal,
    ...(help.length ? { help } : {}),
  };
}

/** Payload ready to send, or the failing field. */
export function payloadFromState(state: FunnelStateV1, now: Date = new Date()): { ok: true; payload: FunnelPayloadV1 } | { ok: false; field: FunnelField } {
  const payload = toPayload(state);
  if (!payload) return { ok: false, field: "role" };
  const r = validatePayload(payload, now);
  return r.ok ? { ok: true, payload } : { ok: false, field: r.field };
}

/** Class code format (4–16 A–Z/0–9) – the code itself is checked by class_join after sign-up. */
export function isClassCodeFormat(code: string): boolean {
  return new RegExp(`^[A-Z0-9]{${FUNNEL_LIMITS.classCodeMin},${FUNNEL_LIMITS.classCodeMax}}$`).test(code);
}
