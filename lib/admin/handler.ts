// Platform admin API logic (SPEC §5, docs/access/ADMIN.md). Pure: the store (service role, server.ts) and the rate-limit
// transport are injected, so every path is unit-tested with mocks (tests/admin-*.test.mjs).
//
// Mutations: body must be JSON with confirm === true, are strictly validated, and are written to admin_audit_log
// BEFORE they are applied (an unaudited change can never happen; a failed change gets a second "<action>.failed" row).
import { guard, fail, json, type AdminContext, type GuardDeps } from "./guard.ts";
import type { AdminStore, AuditFilter, LicenceInput, LicencePatch, UserListFilter } from "./store.ts";
import type { AccountAccessRow, SchoolFreeAccess } from "./types.ts";
import {
  COUNTRIES, DAY_MS, InvalidInput, PACKAGES, SCHOOL_ACTIONS, USER_ACTIONS, date, email, instant, int, isUuid, onlyKeys, oneOf,
  page, query, readBody, text, uuid, type SchoolAction, type UserAction,
} from "./validate.ts";

export type AdminApiDeps = GuardDeps;

const PAGE_SIZE = 50;

/** Thrown by deleteAccount when a running family / school subscription blocks the deletion (lib/account-delete-server.ts). */
const isBillingActive = (e: unknown) => e instanceof Error && (e.name === "BillingActiveError" || e.message === "SUBSCRIPTION_ACTIVE");

class Conflict extends Error {
  readonly reason: string;
  constructor(reason: string) { super("conflict"); this.reason = reason; }
}
class NotFound extends Error { constructor() { super("not_found"); } }

function logFailure(where: string, e: unknown) {
  // Generic: the error class / first token only, never values (no e-mails, no tokens).
  console.error(`admin ${where} failed`, e instanceof Error ? e.message.split(":")[0].slice(0, 80) : "unknown");
}

function errorResponse(where: string, e: unknown): Response {
  if (e instanceof InvalidInput) return fail(400, "invalid_input", { field: e.field });
  if (e instanceof NotFound) return fail(404, "not_found");
  if (e instanceof Conflict) return fail(409, "conflict", { reason: e.reason });
  if (isBillingActive(e)) return fail(409, "subscription_active");
  if (e instanceof Error && e.message === "SUPABASE_NOT_CONFIGURED") return fail(503, "not_configured");
  logFailure(where, e);
  return fail(500, "failed");
}

async function run(request: Request, deps: AdminApiDeps, mutation: boolean, where: string, fn: (ctx: AdminContext) => Promise<Response>) {
  let g;
  try { g = await guard(request, deps, { mutation }); } catch (e) { return errorResponse(`${where} guard`, e); }
  if (!g.ok) return g.response;
  try { return await fn(g.ctx); } catch (e) { return errorResponse(where, e); }
}

async function mutationBody(request: Request): Promise<Record<string, unknown>> {
  const body = await readBody(request);
  if (body.confirm !== true) throw new InvalidInput("confirm");
  return body;
}

const pick = (row: AccountAccessRow | null, keys: (keyof AccountAccessRow)[]) =>
  Object.fromEntries(keys.map((k) => [k, row ? row[k] ?? null : null]));

/** Audit first, then apply. On failure a "<action>.failed" row is added (best effort) and the error is rethrown. */
async function audited<T>(store: AdminStore, ctx: AdminContext, entry: { action: string; target_user?: string | null; target_school?: string | null; details: Record<string, unknown> }, apply: () => Promise<T>): Promise<T> {
  await store.writeAudit({ admin_id: ctx.admin.id, ip: ctx.ip, ...entry });
  try {
    return await apply();
  } catch (e) {
    const code = isBillingActive(e) ? "subscription_active" : e instanceof Conflict ? e.reason : "error";
    await store.writeAudit({ admin_id: ctx.admin.id, ip: ctx.ip, ...entry, action: `${entry.action}.failed`, details: { ...entry.details, error: code } }).catch(() => {});
    throw e;
  }
}

// ---------------------------------------------------------------- user mutations

async function userAction(store: AdminStore, ctx: AdminContext, userId: string, body: Record<string, unknown>, now: Date): Promise<Response> {
  const action = oneOf(body.action, USER_ACTIONS, "action") as UserAction;
  const basics = await store.userBasics(userId);
  if (!basics) throw new NotFound();
  const before = await store.getAccess(userId);
  const self = userId === ctx.admin.id;
  const nowIso = now.toISOString();

  let patch: Partial<AccountAccessRow> = {};
  let extra: Record<string, unknown> = {};
  switch (action) {
    case "set_trial": {
      onlyKeys(body, ["trial_ends_at"]);
      patch = { trial_ends_at: instant(body.trial_ends_at, "trial_ends_at", now, { pastDays: 365, futureDays: 730 }) };
      break;
    }
    case "extend_trial": {
      onlyKeys(body, ["days"]);
      const days = int(body.days, "days", 1, 365);
      const base = Math.max(now.getTime(), before?.trial_ends_at ? Date.parse(before.trial_ends_at) || 0 : 0);
      patch = { trial_ends_at: new Date(base + days * DAY_MS).toISOString() };
      extra = { days };
      break;
    }
    case "grant_access": {
      // Unlimited ({ forever: true }) or until a date ({ until }) – exactly one of them.
      onlyKeys(body, ["until", "note", "forever"]);
      const g = freeAccessInput(body, now);
      patch = {
        free_access_forever: g.forever, free_access_until: g.until, free_access_note: g.note,
        free_access_granted_at: nowIso, free_access_granted_by: ctx.admin.id,
      };
      break;
    }
    case "revoke_access": {
      onlyKeys(body, []);
      // ADMIN.md §4 rule 4 (re-audit #4): never revoke the access of yourself or of another platform admin.
      if (self) throw new Conflict("self");
      if (await store.isPlatformAdmin(userId)) throw new Conflict("platform_admin");
      patch = { free_access_forever: false, free_access_until: null, free_access_note: null, free_access_granted_at: null, free_access_granted_by: null };
      break;
    }
    case "block": {
      onlyKeys(body, ["reason"]);
      if (self) throw new Conflict("self");
      // Security review A1: one admin can never lock another admin out (remove the platform_admins row first, service role).
      if (await store.isPlatformAdmin(userId)) throw new Conflict("platform_admin");
      patch = { blocked_at: before?.blocked_at ?? nowIso, blocked_reason: text(body.reason, "reason", { max: 500 }) };
      break;
    }
    case "unblock": {
      onlyKeys(body, []);
      patch = { blocked_at: null, blocked_reason: null };
      break;
    }
    case "soft_delete": {
      // Step 1 of deleting: block now (the person can still log in and read "Konto gesperrt"), deletion is a separate step.
      onlyKeys(body, ["confirm_email", "reason"]);
      if (self) throw new Conflict("self");
      if (await store.isPlatformAdmin(userId)) throw new Conflict("platform_admin");
      if (!basics.email || email(body.confirm_email, "confirm_email") !== basics.email.toLowerCase()) throw new InvalidInput("confirm_email");
      const reason = text(body.reason, "reason", { max: 400, optional: true });
      patch = { blocked_at: before?.blocked_at ?? nowIso, blocked_reason: `Zur Löschung vorgemerkt${reason ? `: ${reason}` : ""}` };
      break;
    }
    case "delete_account": {
      // Step 2: only for an already blocked account, with the e-mail typed again. Uses the existing deletion path
      // (files, rows by cascade, auth user). Never without both steps.
      onlyKeys(body, ["confirm_text"]);
      if (self) throw new Conflict("self");
      if (!basics.email || typeof body.confirm_text !== "string" || body.confirm_text.trim().toLowerCase() !== basics.email.toLowerCase()) throw new InvalidInput("confirm_text");
      if (!before?.blocked_at) throw new Conflict("not_blocked");
      if (await store.isPlatformAdmin(userId)) throw new Conflict("platform_admin");
      await audited(store, ctx, { action: "user.delete_account", target_user: userId, details: { before: pick(before, ["blocked_at", "blocked_reason"]), email_domain: basics.email.split("@")[1] ?? null } },
        () => store.deleteAccount(userId));
      return json(200, { ok: true, deleted: true });
    }
  }

  const keys = Object.keys(patch) as (keyof AccountAccessRow)[];
  const after = await audited(store, ctx, { action: `user.${action}`, target_user: userId, details: { before: pick(before, keys), after: patch, ...extra } },
    () => store.updateAccess(userId, patch, ctx.admin.id));
  return json(200, { ok: true, account_access: after });
}

/** grant_access body (person or school): { forever: true } or { until } (future, ≤ 10 years), optional note ≤ 500. */
function freeAccessInput(body: Record<string, unknown>, now: Date): { forever: boolean; until: string | null; note: string | null } {
  if (body.forever !== undefined && typeof body.forever !== "boolean") throw new InvalidInput("forever");
  const forever = body.forever === true;
  if (forever && body.until !== undefined && body.until !== null) throw new InvalidInput("until");
  const until = forever ? null : instant(body.until, "until", now, { pastDays: 0, futureDays: 3650 });
  return { forever, until, note: text(body.note, "note", { max: 500, optional: true }) };
}

const grantView = (g: SchoolFreeAccess | null) => (g ? { forever: g.forever, until: g.until, note: g.note } : null);

// ---------------------------------------------------------------- school mutations

function licenceInput(body: Record<string, unknown>): LicenceInput {
  onlyKeys(body, ["package", "status", "student_limit", "start", "end", "billing_interval", "notes"]);
  const pkg = oneOf(body.package, PACKAGES, "package");
  const status = body.status === undefined || body.status === null ? null : oneOf(body.status, ["pilot", "active"] as const, "status");
  const limit = body.student_limit === undefined || body.student_limit === null ? null : int(body.student_limit, "student_limit", 1, 100000);
  if (pkg === "custom" && limit === null) throw new InvalidInput("student_limit");
  const start = body.start ? date(body.start, "start") : null;
  const end = body.end ? date(body.end, "end") : null;
  if (start && end && end < start) throw new InvalidInput("end");
  return {
    package: pkg, status, student_limit: limit, start, end,
    billing_interval: body.billing_interval === undefined ? "yearly" : oneOf(body.billing_interval, ["yearly", "monthly"] as const, "billing_interval"),
    notes: text(body.notes, "notes", { max: 2000, optional: true }),
  };
}

async function schoolAction(store: AdminStore, ctx: AdminContext, schoolId: string, body: Record<string, unknown>, now: Date): Promise<Response> {
  const action = oneOf(body.action, SCHOOL_ACTIONS, "action") as SchoolAction;
  const school = await store.getSchool(schoolId);
  if (!school) throw new NotFound();
  const base = { target_school: schoolId };

  switch (action) {
    case "grant_access": {
      // Free access for everybody the school licence model covers (students, school admins, teachers), no seat limit.
      onlyKeys(body, ["until", "note", "forever"]);
      const g = freeAccessInput(body, now);
      const before = await store.getSchoolGrant(schoolId);
      const after = await audited(store, ctx, { ...base, action: "school.grant_access", details: { before: grantView(before), after: g } },
        () => store.setSchoolGrant(schoolId, g, ctx.admin.id));
      return json(200, { ok: true, free_access: after });
    }
    case "revoke_access": {
      onlyKeys(body, []);
      const before = await store.getSchoolGrant(schoolId);
      if (!before) throw new Conflict("not_granted");
      await audited(store, ctx, { ...base, action: "school.revoke_access", details: { before: grantView(before), after: null } },
        () => store.clearSchoolGrant(schoolId));
      return json(200, { ok: true, free_access: null });
    }
    case "assign_licence": {
      const input = licenceInput(body);
      const id = await audited(store, ctx, { ...base, action: "school.assign_licence", details: { before: school.licence ? { id: school.licence.id, package: school.licence.package, state: school.licence.state, valid_until: school.licence.valid_until } : null, after: input } },
        () => store.assignLicence(schoolId, input));
      return json(200, { ok: true, licence_id: id });
    }
    case "update_licence":
    case "revoke_licence": {
      onlyKeys(body, action === "revoke_licence" ? ["licence_id"] : ["licence_id", "valid_until", "pilot_end", "student_limit", "notes"]);
      const licenceId = uuid(body.licence_id, "licence_id");
      const lic = await store.getLicence(licenceId);
      if (!lic || lic.school_id !== schoolId) throw new NotFound();
      let patch: LicencePatch & { status?: string } = {};
      if (action === "revoke_licence") {
        if (lic.status === "cancelled") throw new Conflict("already_cancelled");
        patch = { status: "cancelled" };
      } else {
        if (body.valid_until !== undefined) {
          if (lic.status === "pilot") throw new InvalidInput("valid_until");
          patch.valid_until = date(body.valid_until, "valid_until");
          if (lic.valid_from && patch.valid_until < lic.valid_from) throw new InvalidInput("valid_until");
        }
        if (body.pilot_end !== undefined) {
          if (lic.status !== "pilot") throw new InvalidInput("pilot_end");
          patch.pilot_end = date(body.pilot_end, "pilot_end");
          if (lic.pilot_start && patch.pilot_end < lic.pilot_start) throw new InvalidInput("pilot_end");
        }
        if (body.student_limit !== undefined) patch.student_limit = int(body.student_limit, "student_limit", 1, 100000);
        if (body.notes !== undefined) patch.notes = text(body.notes, "notes", { max: 2000, optional: true });
        if (!Object.keys(patch).length) throw new InvalidInput("body");
        if (lic.status === "cancelled" || lic.status === "expired") throw new Conflict("licence_closed");
      }
      const keys = Object.keys(patch) as (keyof typeof lic)[];
      const before = Object.fromEntries(keys.map((k) => [k, lic[k] ?? null]));
      const after = await audited(store, ctx, { ...base, action: `school.${action}`, details: { licence_id: licenceId, before, after: patch } },
        () => store.updateLicence(licenceId, patch));
      return json(200, { ok: true, licence: after });
    }
    case "add_admin":
    case "add_teacher": {
      onlyKeys(body, ["email"]);
      const mail = email(body.email);
      const userId = await store.findUserIdByEmail(mail);
      if (!userId) throw new Conflict("user_not_found");
      const existing = action === "add_admin" ? await store.schoolAdmins(schoolId) : await store.schoolTeachers(schoolId);
      if (existing.includes(userId)) throw new Conflict("already_member");
      await audited(store, ctx, { ...base, action: `school.${action}`, target_user: userId, details: { before: null, after: { user_id: userId } } },
        () => (action === "add_admin" ? store.addSchoolAdmin(schoolId, mail).then(() => undefined) : store.addSchoolTeacher(schoolId, userId, ctx.admin.id)));
      return json(200, { ok: true, user_id: userId });
    }
    case "remove_admin":
    case "remove_teacher": {
      onlyKeys(body, ["user_id"]);
      const userId = uuid(body.user_id, "user_id");
      const existing = action === "remove_admin" ? await store.schoolAdmins(schoolId) : await store.schoolTeachers(schoolId);
      if (!existing.includes(userId)) throw new NotFound();
      await audited(store, ctx, { ...base, action: `school.${action}`, target_user: userId, details: { before: { user_id: userId }, after: null } },
        () => (action === "remove_admin" ? store.removeSchoolAdmin(schoolId, userId) : store.removeSchoolTeacher(schoolId, userId)));
      return json(200, { ok: true });
    }
  }
}

// ---------------------------------------------------------------- routes

export function createAdminApi(deps: AdminApiDeps) {
  const now = () => (deps.now ? deps.now() : new Date());
  const { store } = deps;
  const params = (request: Request) => new URL(request.url).searchParams;

  return {
    /** GET /api/admin/me – used by the /admin page to decide: not found / MFA needed / dashboard. */
    me: (request: Request) => run(request, deps, false, "me", async (ctx) => json(200, { user_id: ctx.admin.id, email: ctx.admin.email, aal: ctx.auth === "totp" ? "aal2" : "aal1", auth: ctx.auth, mfa_enrolled: ctx.admin.mfaEnrolled === true })),

    /** GET /api/admin/users?q=&page=&state=&role=&sub=all|active|none&school=all|none|<uuid> */
    users: (request: Request) => run(request, deps, false, "users", async () => {
      const p = params(request);
      const filter: UserListFilter = {
        q: query(p.get("q")), page: page(p.get("page")), pageSize: PAGE_SIZE,
        state: oneOf(p.get("state") ?? "all", ["all", "blocked", "grant", "grant_forever", "trial", "trial_over"] as const, "state"),
        role: oneOf(p.get("role") ?? "all", ["all", "student", "teacher", "school_admin", "parent"] as const, "role"),
        sub: oneOf(p.get("sub") ?? "all", ["all", "active", "none"] as const, "sub"),
        school: ["all", "none"].includes(p.get("school") ?? "all") ? (p.get("school") ?? "all") : uuid(p.get("school"), "school"),
      };
      return json(200, await store.listUsers(filter));
    }),

    /** GET /api/admin/users/:id */
    user: (request: Request, id: string) => run(request, deps, false, "user", async () => {
      const detail = await store.getUser(uuid(id, "id"));
      if (!detail) throw new NotFound();
      return json(200, detail);
    }),

    /** POST /api/admin/users/:id  { action, confirm: true, … } */
    userAction: (request: Request, id: string) => run(request, deps, true, "user action", async (ctx) => {
      const userId = uuid(id, "id");
      return userAction(store, ctx, userId, await mutationBody(request), now());
    }),

    /** GET /api/admin/signups?days=7|30 */
    signups: (request: Request) => run(request, deps, false, "signups", async () => {
      const days = Number(oneOf(params(request).get("days") ?? "7", ["7", "30"] as const, "days")) as 7 | 30;
      const users = await store.recentSignups(days);
      const counts = new Map<string, number>();
      const today = now();
      for (let i = days - 1; i >= 0; i--) counts.set(new Date(today.getTime() - i * DAY_MS).toISOString().slice(0, 10), 0);
      for (const u of users) {
        const day = (u.created_at ?? "").slice(0, 10);
        if (counts.has(day)) counts.set(day, (counts.get(day) ?? 0) + 1);
      }
      return json(200, { days, total: users.length, by_day: [...counts].map(([day, count]) => ({ day, count })), users });
    }),

    /** GET /api/admin/schools?q= */
    schools: (request: Request) => run(request, deps, false, "schools", async () => json(200, { items: await store.listSchools(query(params(request).get("q"))) })),

    /** POST /api/admin/schools { action: "create", name, canton_or_state?, country?, confirm: true } */
    createSchool: (request: Request) => run(request, deps, true, "school create", async (ctx) => {
      const body = await mutationBody(request);
      oneOf(body.action, ["create"] as const, "action");
      onlyKeys(body, ["name", "canton_or_state", "country"]);
      const input = {
        name: text(body.name, "name", { max: 200 })!,
        canton_or_state: text(body.canton_or_state, "canton_or_state", { max: 60, optional: true }) ?? "",
        country: body.country === undefined ? "CH" : oneOf(body.country, COUNTRIES, "country"),
      };
      // The id is only known after the insert, so the audit row is written with target_school after creating.
      // To keep "audit before apply", the intent row is written first (target null) and the result row after.
      await store.writeAudit({ admin_id: ctx.admin.id, ip: ctx.ip, action: "school.create", target_school: null, details: { before: null, after: input } });
      let id: string;
      try { id = await store.createSchool(input); } catch (e) {
        await store.writeAudit({ admin_id: ctx.admin.id, ip: ctx.ip, action: "school.create.failed", target_school: null, details: { after: input, error: "error" } }).catch(() => {});
        throw e;
      }
      await store.writeAudit({ admin_id: ctx.admin.id, ip: ctx.ip, action: "school.create.done", target_school: id, details: { after: input } });
      return json(200, { ok: true, school_id: id });
    }),

    /** GET /api/admin/schools/:id */
    school: (request: Request, id: string) => run(request, deps, false, "school", async () => {
      const s = await store.getSchool(uuid(id, "id"));
      if (!s) throw new NotFound();
      return json(200, s);
    }),

    /** POST /api/admin/schools/:id { action, confirm: true, … } */
    schoolAction: (request: Request, id: string) => run(request, deps, true, "school action", async (ctx) => {
      const schoolId = uuid(id, "id");
      return schoolAction(store, ctx, schoolId, await mutationBody(request), now());
    }),

    /** GET /api/admin/audit?page=&action=&admin_id=&target_user=&target_school=&since= */
    audit: (request: Request) => run(request, deps, false, "audit", async () => {
      const p = params(request);
      const opt = (k: string) => { const v = p.get(k); return v ? uuid(v, k) : null; };
      const action = p.get("action");
      if (action && !/^[a-z_]{1,40}(\.[a-z_]{1,40}){0,2}$/.test(action)) throw new InvalidInput("action");
      const filter: AuditFilter = {
        page: page(p.get("page")), pageSize: PAGE_SIZE, action: action || null,
        admin_id: opt("admin_id"), target_user: opt("target_user"), target_school: opt("target_school"),
        since: p.get("since") ? date(p.get("since"), "since") : null,
      };
      return json(200, await store.listAudit(filter));
    }),
  };
}

export type AdminApi = ReturnType<typeof createAdminApi>;
export { isUuid };
