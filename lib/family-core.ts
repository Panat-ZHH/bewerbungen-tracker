// Pure helpers for the "Familien / Privatkunden" screens (parent dashboard /familie, child side, registration choice).
// No React, no runtime aliases: unit-tested with node --test (tests/family-app.test.mjs).
// Shapes follow the shared contract (family_get_my, family_child_overview, family_create_invite, ...). Readers are tolerant:
// unknown or missing fields fall back to safe defaults so a slightly different server shape never crashes the page.

export type AccountType = "school_student" | "independent_student" | "parent";
export type FamilyRole = "parent" | "child";
export type MemberStatus = "pending" | "active" | "removed";
export type ConsentStatus = "not_required" | "pending" | "granted" | "withdrawn";
export type InviteDirection = "parent_invites_child" | "child_invites_parent";
export type PlanStatus = "trial" | "pilot" | "active" | "paused" | "cancelled";
export type ShareSettings = { progress: boolean; applications: boolean; village: boolean; documents: boolean };

export type FamilyMember = { userId: string; displayName: string; role: FamilyRole; status: MemberStatus; consentStatus: ConsentStatus; shareSettings: ShareSettings | null };
/** `status` = raw licence status; `state` = computed by the server (_family_plan_state: trial|pilot|active|paused|expired|…), null if unknown. */
export type FamilyPlan = { planType: string; status: PlanStatus | string; state: string | null; seatsParents: number; seatsChildren: number; trialEndsAt: string | null };
/** An open invite I created (family_get_my.invites): unused and not expired. */
export type FamilyInvite = { code: string; direction: InviteDirection; expiresAt: string | null };
export type MyFamily = { id: string; name: string; myRole: FamilyRole; members: FamilyMember[]; plan: FamilyPlan | null; myShare: ShareSettings | null; invites: FamilyInvite[] };

/** Registration / role-picker choices. "school" keeps today's student flow untouched (no account_set_type call). */
export type SignupChoice = "school" | "independent" | "parent" | "teacher";

export const DEFAULT_SHARE: ShareSettings = { progress: true, applications: false, village: true, documents: false };
export const CONSENT_AGE = 16;
export const INVITE_CODE_LENGTH = 8;
export const FAMILY_PATH = "/familie";
export const FAMILY_INVITE_PATH = "/familie/einladung";

type Row = Record<string, unknown>;
const obj = (v: unknown): Row | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Row) : null);
const str = (v: unknown, d = "") => (v === null || v === undefined ? d : String(v));
const int = (v: unknown, d = 0) => { const n = Number(v); return Number.isFinite(n) ? Math.round(n) : d; };
const oneOf = <T extends string>(v: unknown, allowed: readonly T[], d: T): T => (allowed.includes(v as T) ? (v as T) : d);

// ---------------------------------------------------------------- missing feature (live DB without the migration)
/** True when PostgREST/Postgres says the RPC or table does not exist yet (the family migration is not deployed). */
export function isMissingFamilyFeature(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { code?: unknown; message?: unknown; status?: unknown; details?: unknown };
  const code = String(e.code ?? "");
  if (["PGRST202", "PGRST205", "PGRST200", "42P01", "42883"].includes(code)) return true;
  if (Number(e.status) === 404) return true;
  const text = `${str(e.message)} ${str(e.details)}`;
  return /could not find the (function|table|relation)|does not exist|schema cache/i.test(text);
}

// ---------------------------------------------------------------- account type + consent age
/** Jahrgang options for the private student signup (10 to 25 years old), newest first. */
export function birthYearOptions(now: Date = new Date()): number[] {
  const y = now.getFullYear();
  return Array.from({ length: 16 }, (_, i) => y - 10 - i);
}
export function isValidBirthYear(year: unknown, now: Date = new Date()): boolean {
  const n = Number(year);
  if (!Number.isInteger(n)) return false;
  const y = now.getFullYear();
  return n <= y - 8 && n >= y - 100;
}
/**
 * Only the birth year is stored (data minimisation), so the exact age is unknown: someone born in `year` is either
 * `now - year` or one year younger. To stay on the safe side the consent notice is shown whenever the person *may* still be under 16.
 * The server decides the real consent_status; this only drives the wording at signup.
 */
export function mayNeedParentalConsent(birthYear: number | null | undefined, now: Date = new Date()): boolean {
  if (birthYear === null || birthYear === undefined || !Number.isFinite(Number(birthYear))) return false;
  return now.getFullYear() - Number(birthYear) - 1 < CONSENT_AGE;
}

/** What a signup / picker choice means for the existing role model and the new account_type. */
export function choiceToAccount(choice: SignupChoice): { role: "student" | "teacher"; accountType: AccountType | null } {
  if (choice === "teacher") return { role: "teacher", accountType: null };
  if (choice === "parent") return { role: "student", accountType: "parent" };
  if (choice === "independent") return { role: "student", accountType: "independent_student" };
  return { role: "student", accountType: null }; // school: unchanged flow, the DB keeps school students as they are
}
/** user_metadata written at signup: the server call (account_set_type) happens on first sign-in, see pendingAccountType. */
export function signupMetadata(choice: SignupChoice, birthYear: number | null): Record<string, unknown> {
  const { role, accountType } = choiceToAccount(choice);
  if (!accountType) return { role };
  return { role, account_type: accountType, ...(accountType === "independent_student" && birthYear ? { birth_year: birthYear } : {}) };
}
/** The account type chosen at signup that still has to be stored with account_set_type, or null. */
export function pendingAccountType(meta: Record<string, unknown> | null | undefined): { type: AccountType; birthYear: number | null } | null {
  if (!meta || meta.account_type_synced === true) return null;
  const type = meta.account_type;
  if (type !== "parent" && type !== "independent_student") return null;
  const by = Number(meta.birth_year);
  return { type, birthYear: type === "independent_student" && Number.isInteger(by) ? by : null };
}
export function isParentMeta(meta: Record<string, unknown> | null | undefined): boolean { return meta?.account_type === "parent"; }

/** Pages a parent account has no use for (they are about the own job search); parents are sent to /familie instead. */
const PARENT_BLOCKED = ["/dashboard", "/applications", "/map", "/cvs", "/search", "/analytics", "/friends", "/classes", "/onboarding", "/bewerbung-check"];
export function parentGuardRedirect(pathname: string): string | null {
  const path = pathname.split(/[?#]/)[0] || "/";
  return PARENT_BLOCKED.some((p) => path === p || path.startsWith(`${p}/`)) ? FAMILY_PATH : null;
}

// ---------------------------------------------------------------- invite codes
/** Upper-case, strip spaces/dashes and anything outside A-Z / 0-9 (codes are 8 characters). */
export function normalizeInviteCode(input: string): string { return String(input ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12); }
export function isValidInviteCode(input: string): boolean { return normalizeInviteCode(input).length === INVITE_CODE_LENGTH; }
/** "ABCD1234" -> "ABCD 1234" for reading aloud / typing. */
export function formatInviteCode(code: string): string { const c = normalizeInviteCode(code); return c.length === 8 ? `${c.slice(0, 4)} ${c.slice(4)}` : c; }
/** Who opens an invite link: `eltern` (child invites parent) or `kind` (parent invites child). Drives the signup role preselect. */
export type InviteAudience = "eltern" | "kind";
export const inviteAudience = (direction: InviteDirection): InviteAudience => (direction === "child_invites_parent" ? "eltern" : "kind");
/** Invite link; with a direction it carries `?fuer=eltern|kind` so a logged-out visitor gets the right signup role. */
export function inviteLink(origin: string, code: string, direction?: InviteDirection): string {
  const base = `${origin.replace(/\/$/, "")}${FAMILY_INVITE_PATH}/${encodeURIComponent(normalizeInviteCode(code))}`;
  return direction ? `${base}?fuer=${inviteAudience(direction)}` : base;
}
/** Reads `fuer` from a query string or from a path with a query (`/familie/einladung/X?fuer=kind`). */
export function readInviteAudience(searchOrPath: string | null | undefined): InviteAudience | null {
  const q = String(searchOrPath ?? "");
  const i = q.indexOf("?");
  const v = new URLSearchParams(i >= 0 ? q.slice(i + 1).split("#")[0] : "").get("fuer");
  return v === "eltern" || v === "kind" ? v : null;
}
/** "ABCD1234" from /familie/einladung/ABCD1234 (null for any other path). */
export function familyInviteCodeFromPath(pathname: string | null | undefined): string | null {
  const m = new RegExp(`^${FAMILY_INVITE_PATH}/([^/?#]+)`).exec(String(pathname ?? ""));
  if (!m) return null;
  try { const code = normalizeInviteCode(decodeURIComponent(m[1])); return code.length === INVITE_CODE_LENGTH ? code : null; } catch { return null; }
}
/** `?next=` for the login redirect of a protected page: path + query + hash (null for the default landing). */
export function loginNextFor(pathname: string | null | undefined, search = "", hash = ""): string | null {
  if (!pathname || pathname === "/dashboard") return null;
  return `${pathname}${search && search !== "?" ? search : ""}${hash && hash !== "#" ? hash : ""}`;
}
/**
 * Signup role to preselect for a safe `next`: family pages -> parent, unless the invite is meant for a child (`fuer=kind`)
 * -> private student. `hint` = which invite hint to show. null = keep the default.
 */
export function signupPreset(next: string | null | undefined): { choice: SignupChoice; hint: "parent" | "child" | null } | null {
  const n = String(next ?? "");
  if (!(n === FAMILY_PATH || n.startsWith(`${FAMILY_PATH}/`) || n.startsWith(`${FAMILY_PATH}?`) || n.startsWith(`${FAMILY_PATH}#`))) return null;
  const invite = n.startsWith(`${FAMILY_INVITE_PATH}/`);
  if (readInviteAudience(n) === "kind") return { choice: "independent", hint: "child" };
  return { choice: "parent", hint: invite ? "parent" : null };
}
export function inviteShareText(direction: InviteDirection, code: string, link: string): string {
  const who = direction === "parent_invites_child" ? "Ich lade dich in unsere Familie bei WendApply ein." : "Ich möchte dir meinen Fortschritt bei WendApply zeigen.";
  return `${who} Öffne den Link oder gib den Code ${formatInviteCode(code)} unter «Familie» ein: ${link}`;
}
export function readInvite(data: unknown): { code: string; expiresAt: string | null } | null {
  const r = obj(Array.isArray(data) ? data[0] : data);
  const code = normalizeInviteCode(str(r?.code));
  return code ? { code, expiresAt: r?.expires_at ? str(r.expires_at) : null } : null;
}

// ---------------------------------------------------------------- family_get_my
export function readShare(v: unknown): ShareSettings {
  const r = obj(v) ?? {};
  const pick = (k: keyof ShareSettings) => (typeof r[k] === "boolean" ? (r[k] as boolean) : DEFAULT_SHARE[k]);
  return { progress: pick("progress"), applications: pick("applications"), village: pick("village"), documents: pick("documents") };
}
export function readMember(v: unknown): FamilyMember | null {
  const r = obj(v);
  if (!r || !r.user_id) return null;
  return {
    userId: str(r.user_id), displayName: str(r.display_name).trim() || "Ohne Namen", role: oneOf(r.role, ["parent", "child"] as const, "child"),
    status: oneOf(r.status, ["pending", "active", "removed"] as const, "active"),
    consentStatus: oneOf(r.consent_status, ["not_required", "pending", "granted", "withdrawn"] as const, "not_required"),
    shareSettings: r.share_settings ? readShare(r.share_settings) : null,
  };
}
export function readPlan(v: unknown): FamilyPlan | null {
  const r = obj(v);
  if (!r) return null;
  return { planType: str(r.plan_type, "family"), status: str(r.status, "trial"), state: r.state ? str(r.state) : null, seatsParents: int(r.seats_parents, 1), seatsChildren: int(r.seats_children, 1), trialEndsAt: r.trial_ends_at ? str(r.trial_ends_at) : null };
}
/** Normalises the family_get_my payload (jsonb object, possibly wrapped in an array). null = no family yet. */
export function readMyFamily(data: unknown, myUserId?: string | null): MyFamily | null {
  const root = obj(Array.isArray(data) ? data[0] : data);
  if (!root) return null;
  const fam = obj(root.family) ?? (root.id ? root : null);
  if (!fam || !fam.id) return null;
  const members = (Array.isArray(root.members) ? root.members : []).map(readMember).filter((m): m is FamilyMember => !!m && m.status !== "removed");
  const me = myUserId ? members.find((m) => m.userId === myUserId) : undefined;
  const myRole = oneOf(root.my_role, ["parent", "child"] as const, me?.role ?? "child");
  const myShare = root.my_share_settings ? readShare(root.my_share_settings) : me?.shareSettings ?? (myRole === "child" ? { ...DEFAULT_SHARE } : null);
  return { id: str(fam.id), name: str(fam.name).trim() || "Meine Familie", myRole, members, plan: readPlan(root.plan), myShare, invites: readInvites(root.invites) };
}
/** Open invites from family_get_my (tolerant: drops rows without a valid code). */
export function readInvites(v: unknown): FamilyInvite[] {
  return (Array.isArray(v) ? v : []).map((x) => obj(x)).filter((x): x is Row => !!x).map((x) => ({
    code: normalizeInviteCode(str(x.code)), direction: oneOf(x.direction, ["parent_invites_child", "child_invites_parent"] as const, "child_invites_parent"),
    expiresAt: x.expires_at ? str(x.expires_at) : null,
  })).filter((i) => i.code.length === INVITE_CODE_LENGTH);
}
/** Newest open invite of one direction (null if none). The server orders by created_at, so the last one wins. */
export function openInvite(f: Pick<MyFamily, "invites"> | null | undefined, direction: InviteDirection): FamilyInvite | null {
  const list = (f?.invites ?? []).filter((i) => i.direction === direction);
  return list.length ? list[list.length - 1] : null;
}
/** A family I could leave without losing anything: only me in it, and no plan row (S9 "empty-family switch"). */
export function isEmptyOwnFamily(f: MyFamily | null | undefined, myUserId?: string | null): boolean {
  if (!f || f.plan) return false;
  const others = f.members.filter((m) => m.status !== "removed" && (!myUserId || m.userId !== myUserId));
  return myUserId ? others.length === 0 : f.members.filter((m) => m.status !== "removed").length <= 1;
}
export const childrenOf = (f: MyFamily) => f.members.filter((m) => m.role === "child");
export const parentsOf = (f: MyFamily) => f.members.filter((m) => m.role === "parent");

/** Free seats per role; null limit = unknown (no plan yet: the server enforces the limit in family_join). */
export function seatUsage(f: MyFamily): { children: { used: number; limit: number | null; full: boolean }; parents: { used: number; limit: number | null; full: boolean } } {
  const used = (role: FamilyRole) => f.members.filter((m) => m.role === role && m.status !== "removed").length;
  const limitC = f.plan?.seatsChildren ?? 1;
  const limitP = f.plan?.seatsParents ?? 1;
  return { children: { used: used("child"), limit: limitC, full: used("child") >= limitC }, parents: { used: used("parent"), limit: limitP, full: used("parent") >= limitP } };
}

// ---------------------------------------------------------------- consent + sharing
export const CONSENT_LABEL: Record<ConsentStatus, string> = { not_required: "Keine Zustimmung nötig", pending: "Zustimmung offen", granted: "Zustimmung erteilt", withdrawn: "Zustimmung zurückgezogen" };
export const CONSENT_TONE: Record<ConsentStatus, "neutral" | "info" | "success" | "warning" | "danger"> = { not_required: "neutral", pending: "warning", granted: "success", withdrawn: "neutral" };
/** Family sharing works only for active members whose consent is granted or not required (16+). */
export function sharingActive(m: Pick<FamilyMember, "status" | "consentStatus">): boolean { return m.status === "active" && (m.consentStatus === "granted" || m.consentStatus === "not_required"); }
export const SHARE_LABELS: { key: keyof ShareSettings; label: string; on: string; off: string }[] = [
  { key: "progress", label: "Fortschritt teilen", on: "Deine Eltern sehen, wie viele Bewerbungen du hast und wie weit sie sind.", off: "Deine Eltern sehen keine Zahlen zu deinen Bewerbungen." },
  { key: "applications", label: "Bewerbungsliste teilen", on: "Firma, Stelle und Stand jeder Bewerbung sind sichtbar. Notizen bleiben privat.", off: "Firmen und Stellen bleiben privat." },
  { key: "village", label: "Dorf teilen", on: "Deine Eltern sehen die Stufe und die Gebäude deines Dorfs.", off: "Dein Dorf bleibt privat." },
];
/** Applying one toggle keeps all other keys (including ones this UI does not show, e.g. documents). */
export function nextShare(current: ShareSettings | null, key: keyof ShareSettings, value: boolean): ShareSettings { return { ...(current ?? DEFAULT_SHARE), [key]: value }; }
/** Child-facing explanation of the consent state, in plain language. */
export function consentNotice(status: ConsentStatus): { tone: "info" | "warning" | "success"; title: string; text: string } | null {
  if (status === "pending") return { tone: "warning", title: "Deine Eltern müssen zuerst zustimmen", text: "Weil du unter 16 bist, braucht es die Zustimmung eines Elternteils, bevor deine Familie etwas sieht. Bis dahin ist alles privat. Du kannst WendApply ganz normal nutzen." };
  if (status === "withdrawn") return { tone: "info", title: "Teilen ist pausiert", text: "Die Zustimmung wurde zurückgezogen. Deine Familie sieht im Moment nichts von dir." };
  return null;
}

// ---------------------------------------------------------------- child overview (family_child_overview)
export type ChildApplication = { company: string; position: string; status: string; updatedAt: string | null };
export type ChildOverview = {
  displayName: string; shared: { progress: boolean; applications: boolean; village: boolean }; consentStatus: ConsentStatus | null;
  progress: { total: number; statusCounts: Record<string, number>; lastActivity: string | null; placed: boolean } | null;
  village: { level: number; items: number; points: number | null } | null;
  applications: ChildApplication[] | null;
};
const counts = (v: unknown): Record<string, number> => Object.fromEntries(Object.entries(obj(v) ?? {}).map(([k, n]) => [k, int(n)]).filter(([, n]) => (n as number) > 0));
export function readChildOverview(data: unknown): ChildOverview | null {
  const r = obj(Array.isArray(data) ? data[0] : data);
  if (!r) return null;
  const share = obj(r.share_settings) ?? obj(r.shared) ?? {};
  const p = obj(r.progress);
  const v = obj(r.village);
  const apps = Array.isArray(r.applications) ? r.applications : null;
  const statusCounts = counts(p?.status_counts ?? r.status_counts);
  const total = p ? int(p.applications_total ?? p.total ?? p.applications, Object.values(statusCounts).reduce((a, b) => a + b, 0)) : 0;
  return {
    displayName: str(obj(r.child)?.display_name ?? r.display_name).trim() || "Dein Kind",
    shared: { progress: p !== null || share.progress === true, applications: apps !== null || share.applications === true, village: v !== null || share.village === true },
    consentStatus: r.consent_status ? oneOf(r.consent_status, ["not_required", "pending", "granted", "withdrawn"] as const, "pending") : null,
    progress: p ? { total, statusCounts, lastActivity: p.last_activity ? str(p.last_activity) : null, placed: p.placed === true || (statusCounts.offer ?? 0) > 0 } : null,
    village: v ? { level: int(v.islands ?? v.level, 1), items: int(v.items ?? v.item_count ?? (Array.isArray(v.items) ? (v.items as unknown[]).length : 0)), points: v.points_earned === undefined && v.points === undefined && v.earned === undefined ? null : int(v.points_earned ?? v.points ?? v.earned) } : null,
    applications: apps ? apps.map((a) => obj(a)).filter((a): a is Row => !!a).map((a) => ({ company: str(a.company), position: str(a.position), status: str(a.status, "saved"), updatedAt: a.updated_at ? str(a.updated_at) : null })) : null,
  };
}

/** Status groups for the parent view (same wording as the rest of the app, no sensitive detail). */
export const STATUS_GROUPS: { key: string; label: string; statuses: string[] }[] = [
  { key: "open", label: "In Vorbereitung", statuses: ["saved", "preparing"] },
  { key: "applied", label: "Beworben", statuses: ["applied"] },
  { key: "talks", label: "Gespräch / Schnuppern", statuses: ["interview", "schnupper", "schnupper_done", "trial"] },
  { key: "offer", label: "Zusage", statuses: ["offer", "accepted"] },
  { key: "rejected", label: "Absage", statuses: ["rejected", "declined"] },
];
export function groupStatusCounts(c: Record<string, number>): { key: string; label: string; count: number }[] {
  const known = new Set(STATUS_GROUPS.flatMap((g) => g.statuses));
  const rows = STATUS_GROUPS.map((g) => ({ key: g.key, label: g.label, count: g.statuses.reduce((s, k) => s + (c[k] ?? 0), 0) }));
  const other = Object.entries(c).filter(([k]) => !known.has(k)).reduce((s, [, n]) => s + n, 0);
  if (other) rows.push({ key: "other", label: "Andere", count: other });
  return rows;
}
const STATUS_TEXT: Record<string, string> = { saved: "Gemerkt", preparing: "In Vorbereitung", applied: "Beworben", interview: "Gespräch", schnupper: "Schnuppern", schnupper_done: "Geschnuppert", trial: "Schnuppern", offer: "Zusage", accepted: "Zusage", rejected: "Absage", declined: "Abgelehnt" };
export const statusText = (s: string) => STATUS_TEXT[s] ?? s;

// ---------------------------------------------------------------- plan card
export const PLAN_STATUS_LABEL: Record<string, string> = { trial: "Testphase", pilot: "Pilot", active: "Aktiv", paused: "Pausiert", cancelled: "Beendet", expired: "Abgelaufen" };
export const PLAN_STATUS_TONE: Record<string, "neutral" | "info" | "success" | "warning" | "danger"> = { trial: "info", pilot: "info", active: "success", paused: "warning", cancelled: "neutral", expired: "neutral" };
export function daysLeft(iso: string | null | undefined, now: Date = new Date()): number | null {
  if (!iso) return null;
  const t = Date.parse(iso.length === 10 ? `${iso}T23:59:59` : iso);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.ceil((t - now.getTime()) / 864e5));
}
export function formatDateCh(iso: string | null | undefined): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : "";
}
/** Plan states (server `state`) that give access: the child sees "Familienpaket aktiv" only for these. */
export const PLAN_ACCESS_STATES = ["trial", "pilot", "active"] as const;
/** True when the family plan currently gives access (uses the computed `state`, falls back to the raw status). */
export function planGivesAccess(plan: FamilyPlan | null | undefined): boolean {
  if (!plan) return false;
  return (PLAN_ACCESS_STATES as readonly string[]).includes(plan.state ?? plan.status);
}
/**
 * Child-facing plan line (S8): neutral, never payment details. Active -> badge "Aktiv" + "Familienpaket aktiv".
 * Everything else (none, past_due, expired, paused) -> no badge + "Das Familienpaket bucht ein Elternteil …".
 */
export function childPlanLine(plan: FamilyPlan | null | undefined): { active: boolean; badge: string | null; text: string } {
  return planGivesAccess(plan)
    ? { active: true, badge: "Aktiv", text: "Familienpaket aktiv" }
    : { active: false, badge: null, text: "Das Familienpaket bucht ein Elternteil. Für dich bleibt WendApply kostenlos." };
}

/**
 * One line describing the plan: "Testphase · noch 12 Tage" / "Familienpaket: 1 Elternteil, 1 Kind".
 * `online` (online payment flag, onlinePaymentEnabled()): with online payment on, "Bald verfügbar" never appears (S7); a missing plan has no status.
 * The status label follows the computed `state` when the server sends it (an expired row is never "Aktiv").
 */
export function planSummary(plan: FamilyPlan | null, now: Date = new Date(), opts: { online?: boolean } = {}): { title: string; status: string; detail: string } {
  if (!plan && opts.online) return { title: "Familienpaket", status: "", detail: "Für Schülerinnen und Schüler bleibt WendApply kostenlos. Das Familienpaket bucht ein Elternteil." };
  if (!plan) return { title: "Familienpaket", status: "Bald verfügbar", detail: "Das Familienpaket ist noch nicht freigeschaltet. Du kannst WendApply trotzdem schon nutzen." };
  if (plan.state === "expired") return { title: "Familienpaket", status: "Abgelaufen", detail: "Das Familienpaket ist abgelaufen." };
  const key = plan.state && plan.state in PLAN_STATUS_LABEL ? plan.state : plan.status;
  const status = PLAN_STATUS_LABEL[key] ?? key;
  const seats = `${plan.seatsParents} ${plan.seatsParents === 1 ? "Elternteil" : "Elternteile"}, ${plan.seatsChildren} ${plan.seatsChildren === 1 ? "Kind" : "Kinder"}`;
  const left = plan.status === "trial" ? daysLeft(plan.trialEndsAt, now) : null;
  const detail = left === null ? seats : left === 0 ? `${seats} · Testphase endet heute` : `${seats} · noch ${left} ${left === 1 ? "Tag" : "Tage"} Testphase`;
  return { title: "Familienpaket", status, detail };
}

// ---------------------------------------------------------------- errors
// Same wording as FAMILY_COPY.seat / wrongType (lib/family-copy.ts); kept here so this module stays import-free for node --test.
export const SEAT_FULL_CHILD = "In eurer Familie ist schon ein Kind verbunden. Das Familienpaket gilt für 1 Kind. Für ein weiteres Kind schreib uns über die Kontaktseite.";
export const SEAT_FULL_PARENT = "In dieser Familie ist schon ein Elternteil verbunden. Für ein zweites Elternteil schreib uns über die Kontaktseite.";
export const WRONG_TYPE_PARENT = "Dieser Code ist für ein Elternkonto. Du bist als Schüler/in angemeldet.";
export const WRONG_TYPE_CHILD = "Dieser Code ist für ein Schülerkonto. Du bist als Elternteil angemeldet.";
export const ALREADY_IN_FAMILY_TEXT = "Du bist schon in einer Familie. Verlasse sie zuerst, wenn du wechseln möchtest.";
/** The RPC said "already in a family" (family_join / family_create): the UI may offer the empty-family switch (S9). */
export function isAlreadyInFamily(error: unknown): boolean {
  const e = (error ?? {}) as { message?: unknown; code?: unknown };
  return /ALREADY_IN_FAMILY/.test(`${str(e.message)} ${str(e.code)}`);
}
/** The RPC needs a birth year first (BIRTH_YEAR_REQUIRED): the student UI shows the Jahrgang gate. */
export function isBirthYearRequired(error: unknown): boolean {
  const e = (error ?? {}) as { message?: unknown; code?: unknown };
  return /BIRTH_YEAR_REQUIRED/.test(`${str(e.message)} ${str(e.code)}`);
}
/** German message for an error raised by a family RPC (the server raises short codes; unknown errors get a generic text). */
export function familyError(error: unknown): string {
  const e = (error ?? {}) as { message?: unknown; code?: unknown; details?: unknown };
  const text = `${str(e.message)} ${str(e.code)}`;
  // Codes whose DB detail is outdated or not specific enough: our own copy wins (no "Zugang anfragen", no "bald verfügbar").
  if (/FAMILY_SEAT_LIMIT|WA010/.test(text)) return /eltern|parent/i.test(str(e.details)) ? SEAT_FULL_PARENT : SEAT_FULL_CHILD;
  if (/ALREADY_IN_FAMILY/.test(text)) return ALREADY_IN_FAMILY_TEXT;
  if (/INVITE_WRONG_ACCOUNT_TYPE/.test(text)) return /schülerkonto/i.test(str(e.details)) ? WRONG_TYPE_CHILD : WRONG_TYPE_PARENT;
  if (/BIRTH_YEAR_REQUIRED/.test(text)) return "Bitte gib zuerst deinen Jahrgang an.";
  // The migration raises short codes with a German, user-facing `detail` (e.g. INVALID_NAME, BIRTH_YEAR_LOCKED): prefer it.
  const detail = str(e.details).trim();
  if (detail && /^[A-Z_]+$/.test(str(e.message).trim())) return detail;
  if (/seat|platz|SEATS?_FULL|limit/i.test(text)) return SEAT_FULL_CHILD;
  if (/expired|abgelaufen/i.test(text)) return "Dieser Code ist abgelaufen. Bitte um einen neuen Code (er gilt 7 Tage).";
  if (/used|already_used|bereits verwendet/i.test(text)) return "Dieser Code wurde schon verwendet. Jeder Code funktioniert nur einmal.";
  if (/invalid|not.?found|unknown|INVALID_CODE/i.test(text)) return "Diesen Code kennen wir nicht. Prüfe die 8 Zeichen und versuche es nochmals.";
  if (/already|ALREADY_MEMBER|bereits/i.test(text)) return ALREADY_IN_FAMILY_TEXT;
  if (/\bSELF\b|OWN_FAMILY|SAME_ROLE|WRONG_ROLE|WRONG_ACCOUNT_TYPE/i.test(text)) return "Dieser Code passt nicht zu deinem Konto (Elternteil oder Kind).";
  if (/consent|zustimmung/i.test(text)) return "Dafür braucht es zuerst die Zustimmung eines Elternteils.";
  if (/FORBIDDEN|42501|permission|not allowed|NOT_A?_?PARENT/i.test(text)) return "Das darfst du in dieser Familie nicht ändern.";
  if (/AUTH|not authenticated|JWT/i.test(text)) return "Bitte melde dich erneut an.";
  return "Das hat nicht geklappt. Versuche es bitte nochmals.";
}

// ---------------------------------------------------------------- waitlist ("Zugang anfragen")
/** Must match the check in waitlist_join / waitlist_requests.kind (migration 20261116140000). */
export type WaitlistKind = "family" | "parent" | "student" | "school" | "other";
export function waitlistProblem(email: string, message: string): string | null {
  const e = email.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) || e.length > 254) return "Bitte gib eine gültige E-Mail-Adresse ein.";
  if (message.trim().length > 1000) return "Die Nachricht ist zu lang (höchstens 1000 Zeichen).";
  return null;
}
