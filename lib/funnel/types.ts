// Shared types + constants of the sign-up funnel (SPEC-DATA §2.2, SPEC-FLOW §4.1). Pure: no browser/Supabase imports.
// Owner: onb-data. onb-funnel / onb-tour import from here; the server mirror is funnel_apply() in
// supabase/migrations/20261119100000_onboarding_funnel.sql (parity tests: tests/onb-data-validate.test.mjs).

/** localStorage key of the funnel answers (resume, Google path). Never holds e-mail, password or tokens. */
export const FUNNEL_KEY = "wendapply.funnel.v1";
/** sessionStorage `{ email, at }` for /start/bestaetigen – the ONLY place an e-mail is kept (never localStorage). */
export const FUNNEL_CONFIRM_KEY = "wendapply.funnel.confirm";
/** Saved answers older than this (by `updatedAt`) are discarded silently. */
export const FUNNEL_TTL_MS = 14 * 24 * 3600 * 1000;
/** Version written to profiles.funnel_version by funnel_apply. */
export const FUNNEL_VERSION = 1;

export type FunnelRole = "student" | "parent" | "staff";
export const FUNNEL_ROLES = ["student", "parent", "staff"] as const;

/** Help wishes (screen `hilfe` for pupils, `begleiten` for parents). Same values as the CHECK on profiles.help_wishes. */
export const HELP_STUDENT = ["lebenslauf", "brief", "schnuppern", "ueberblick", "eltern"] as const;
export const HELP_PARENT = ["ueberblick", "fristen", "dokumente", "ermutigen"] as const;
export type HelpStudent = (typeof HELP_STUDENT)[number];
export type HelpParent = (typeof HELP_PARENT)[number];

export const FAMILY_CHOICES = ["jetzt", "spaeter"] as const;
export const PARENT_KID_CHOICES = ["einladen", "code", "spaeter"] as const;
export const STAFF_ACCESS_CHOICES = ["licence", "pilot", "admin"] as const;
export type FamilyChoice = (typeof FAMILY_CHOICES)[number];
export type ParentKidChoice = (typeof PARENT_KID_CHOICES)[number];
export type StaffAccess = (typeof STAFF_ACCESS_CHOICES)[number];

export const FUNNEL_LIMITS = {
  firstName: 40, place: 60, profession: 60, professionsMax: 3, classCodeMin: 4, classCodeMax: 16,
  weeklyGoalMin: 1, weeklyGoalMax: 10, weeklyGoalDefault: 3, helpMax: 5, payloadBytes: 4096,
} as const;

/** Step slugs per path (SPEC-FLOW §1.1). */
export const STUDENT_STEPS = ["weg", "rolle", "name", "jahrgang", "schule", "ort", "beruf", "wochenziel", "hilfe", "dabei", "plan", "konto"] as const;
export const PARENT_STEPS = ["weg", "rolle", "name", "begleiten", "kind", "plan", "konto"] as const;
export const STAFF_STEPS = ["weg", "rolle", "zugang", "konto"] as const;
export type FunnelStep = (typeof STUDENT_STEPS)[number] | (typeof PARENT_STEPS)[number] | (typeof STAFF_STEPS)[number];

/** Browser state (SPEC-FLOW §4.1). Never contains e-mail, password or tokens. */
export interface FunnelStateV1 {
  v: 1;
  startedAt: number;
  updatedAt: number;
  step: string;
  /** Safe same-origin path (safeNextPath) to continue to after the account exists, or null. */
  next: string | null;
  role: FunnelRole | null;
  firstName: string;
  birthYear: number | null;
  schoolLevel: string;
  /** Transient (format only, never sent to funnel_apply): joined after sign-up via /classes/join/<code>. */
  classCode: string;
  canton: string;
  place: string;
  professions: string[];
  unsure: boolean;
  startYear: number | null;
  weeklyGoal: number;
  help: string[];
  /** Transient: `jetzt` → /familie invite step after save. */
  family: FamilyChoice | null;
  /** Transient (parent): `code` → /familie/einladung/<inviteCode>. */
  parentKid: ParentKidChoice | null;
  inviteCode: string;
  /** Transient (staff): only `licence` creates an account. */
  staffAccess: StaffAccess | null;
}

/** What the server accepts (funnel_apply / signUp metadata `wa_funnel`). Transient answers are NOT part of it. */
export interface FunnelPayloadV1 {
  v: 1;
  role: FunnelRole;
  /** «Überspringen» on the cross-device notice: marks the funnel done, saves nothing but the role. */
  skipped?: boolean;
  firstName?: string;
  birthYear?: number;
  schoolLevel?: string;
  canton?: string;
  place?: string;
  professions?: string[];
  unsure?: boolean;
  startYear?: number;
  weeklyGoal?: number;
  help?: string[];
}
export const PAYLOAD_KEYS = ["v", "role", "skipped", "firstName", "birthYear", "schoolLevel", "canton", "place", "professions", "unsure",
  "startYear", "weeklyGoal", "help"] as const;

/** Role as the server sees it after the save (`_funnel_role_of`). */
export type ServerRole = "student" | "parent" | "teacher" | "school_admin";
export type FunnelApplyResult =
  | { applied: true; role: ServerRole; role_mismatch: boolean; under_16: boolean }
  | { applied: false; reason: "already_done" | "not_new" | "no_answers"; role: ServerRole };

/** Field name of the first failing rule (same names as the SQL `INVALID_FUNNEL` detail). */
export type FunnelField = "size" | "key" | "v" | "role" | "firstName" | "birthYear" | "schoolLevel" | "canton" | "place" | "professions"
  | "unsure" | "startYear" | "weeklyGoal" | "help";
export type ValidationResult = { ok: true } | { ok: false; field: FunnelField };

/** Outcome of applyFunnelIfPending() (lib/funnel/apply.ts) for the UI. */
export type ApplyOutcome =
  | { status: "none" }                                   // nothing pending (no local copy, no metadata copy)
  | { status: "applied"; result: Extract<FunnelApplyResult, { applied: true }>; redirect: string | null }
  | { status: "skipped"; result: Extract<FunnelApplyResult, { applied: false }> } // already_done / not_new / no_answers – local copy cleared
  | { status: "error"; kind: "rate_limit" | "invalid" | "network" | "unknown" };

/** sessionStorage record for /start/bestaetigen. */
export interface FunnelConfirmRecord { email: string; at: number }
