// SERVER ONLY: the platform admin store on top of the Supabase service role (SPEC §5). Only route handlers in
// app/api/admin/* import this, and only call it AFTER lib/admin/guard.ts verified token, platform admin and MFA.
// The service role key is read here and nowhere else in the admin code; it never reaches the browser.
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { deleteAccount as deleteAccountPath } from "../account-delete-server.ts";
import { defaultRateLimitRpc } from "../rate-limit/index.ts";
import type { AccessInfo } from "../access/types.ts";
import { createAdminApi, type AdminApi } from "./handler.ts";
import type { AdminStore, AuditFilter, LicenceInput, UserListFilter, VerifiedUser } from "./store.ts";
import type {
  AccountAccessRow, AdminRole, AdminSchoolDetail, AdminSchoolPerson, AdminSchoolRef, AdminSchoolRow, AdminSubscription, AdminUserDetail,
  AdminUserRow, AuditEntry, Paged, SchoolLicence,
} from "./types.ts";

const MISSING = ["42P01", "PGRST205", "PGRST202", "42883"]; // table / function not there yet (DB before the access migration)
const OPEN = ["active", "trialing", "past_due", "unpaid", "paused", "incomplete"];
const MAX_USERS = 20_000;

type Row = Record<string, unknown>;
type DbError = { code?: string; message?: string } | null;

function dbFail(where: string, error: DbError): never {
  throw new Error(`DB_FAILED:${where}:${error?.code ?? ""}`);
}

export function serviceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_NOT_CONFIGURED");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Same rules as public._licence_state (supabase/migrations/20261116100000_b2b_schools_licences.sql). */
export function licenceState(l: { status: string; pilot_end: string | null; valid_from: string | null; valid_until: string | null }, today = new Date().toISOString().slice(0, 10)): string {
  if (l.status === "cancelled") return "cancelled";
  if (l.status === "expired") return "expired";
  if (l.status === "pilot") return l.pilot_end && l.pilot_end < today ? "expired" : "pilot";
  if (l.valid_from && l.valid_from > today) return "not_started";
  if (l.valid_until && l.valid_until < today) return "expired";
  return "active";
}

/** The licence that governs a school today: usable first (newest), else the newest row. */
export function currentLicence(list: SchoolLicence[]): SchoolLicence | null {
  const sorted = [...list].sort((a, b) => {
    const ua = a.state === "pilot" || a.state === "active" ? 1 : 0;
    const ub = b.state === "pilot" || b.state === "active" ? 1 : 0;
    return ub - ua || b.created_at.localeCompare(a.created_at);
  });
  return sorted[0] ?? null;
}

/** Google identity with Google's own email_verified = true, same e-mail as the confirmed account. Never trusts an unverified e-mail. */
export function googleVerified(u: Pick<User, "email" | "email_confirmed_at" | "identities">): boolean {
  const email = (u.email ?? "").trim().toLowerCase();
  if (!email || !u.email_confirmed_at) return false;
  return (u.identities ?? []).some((i) => {
    const d = (i.identity_data ?? {}) as Record<string, unknown>;
    const idEmail = String(d.email ?? (i as { email?: string }).email ?? "").trim().toLowerCase();
    return i.provider === "google" && (d.email_verified === true || d.email_verified === "true") && idEmail === email;
  });
}

export function stripeLinks(sub: { stripe_subscription_id: string; stripe_customer_id: string }, live = /^(sk|rk)_live_/.test(process.env.STRIPE_SECRET_KEY ?? "")) {
  const base = `https://dashboard.stripe.com/${live ? "" : "test/"}`;
  return { stripe_url: `${base}subscriptions/${encodeURIComponent(sub.stripe_subscription_id)}`, customer_url: `${base}customers/${encodeURIComponent(sub.stripe_customer_id)}` };
}

function toLicence(r: Row): SchoolLicence & { school_id: string } {
  const l = {
    id: String(r.id), school_id: String(r.school_id), package: String(r.package), status: String(r.status),
    student_limit: Number(r.student_limit), pilot_start: (r.pilot_start as string) ?? null, pilot_end: (r.pilot_end as string) ?? null,
    valid_from: (r.valid_from as string) ?? null, valid_until: (r.valid_until as string) ?? null,
    billing_interval: String(r.billing_interval ?? "yearly"), notes: (r.notes as string) ?? null, created_at: String(r.created_at), state: "",
  };
  l.state = licenceState(l);
  return l;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i]); }
  }));
  return out;
}

export function supabaseAdminStore(db: SupabaseClient = serviceClient()): AdminStore {
  /** Rows of a table (paged by 1000). Missing table → [] (the admin area works on a DB before the access migration). */
  async function all(table: string, cols: string, order?: string): Promise<Row[]> {
    const out: Row[] = [];
    for (let from = 0; from < MAX_USERS; from += 1000) {
      const base = db.from(table).select(cols);
      const { data, error } = await (order ? base.order(order) : base).range(from, from + 999);
      if (error) { if (MISSING.includes(error.code ?? "")) return []; dbFail(table, error); }
      out.push(...((data ?? []) as unknown as Row[]));
      if ((data ?? []).length < 1000) break;
    }
    return out;
  }

  async function inIds(table: string, cols: string, col: string, ids: string[]): Promise<Row[]> {
    if (!ids.length) return [];
    const out: Row[] = [];
    for (let i = 0; i < ids.length; i += 100) {
      const { data, error } = await db.from(table).select(cols).in(col, ids.slice(i, i + 100));
      if (error) { if (MISSING.includes(error.code ?? "")) return []; dbFail(table, error); }
      out.push(...((data ?? []) as unknown as Row[]));
    }
    return out;
  }

  async function authUsers(): Promise<User[]> {
    const out: User[] = [];
    for (let page = 1; page <= MAX_USERS / 1000; page++) {
      const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) dbFail("auth.users", { code: error.code ?? error.name });
      out.push(...data.users);
      if (data.users.length < 1000) break;
    }
    return out;
  }

  async function authUser(id: string): Promise<User | null> {
    const { data, error } = await db.auth.admin.getUserById(id);
    if (error || !data.user) return null;
    return data.user;
  }

  async function appAccess(id: string): Promise<AccessInfo | null> {
    const { data, error } = await db.rpc("app_access", { p_uid: id });
    if (error) return null;
    return (data ?? null) as AccessInfo | null;
  }

  interface Facts { roles: Map<string, Row>; profiles: Map<string, Row>; access: Map<string, Row> }

  async function facts(ids: string[] | null): Promise<Facts> {
    const by = (rows: Row[], key: string) => new Map(rows.map((r) => [String(r[key]), r]));
    const [roles, profiles, access] = ids
      ? await Promise.all([inIds("user_roles", "user_id, role, display_name", "user_id", ids), inIds("profiles", "user_id, account_type, first_name, last_name", "user_id", ids), inIds("account_access", "*", "user_id", ids)])
      : await Promise.all([all("user_roles", "user_id, role, display_name"), all("profiles", "user_id, account_type, first_name, last_name"), all("account_access", "*")]);
    return { roles: by(roles, "user_id"), profiles: by(profiles, "user_id"), access: by(access, "user_id") };
  }

  function roleOf(id: string, f: Facts): AdminRole {
    if (f.profiles.get(id)?.account_type === "parent") return "parent";
    const r = f.roles.get(id)?.role;
    return r === "student" || r === "teacher" || r === "school_admin" ? r : "unknown";
  }

  function nameOf(id: string, f: Facts): string | null {
    const p = f.profiles.get(id);
    const full = p ? `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() : "";
    return full || ((f.roles.get(id)?.display_name as string) || null);
  }

  function toSub(r: Row): AdminSubscription {
    return {
      id: String(r.stripe_subscription_id), customer: String(r.stripe_customer_id), plan_id: String(r.plan_id), status: String(r.status),
      current_period_end: (r.current_period_end as string) ?? null, cancel_at_period_end: Boolean(r.cancel_at_period_end),
      owner: r.user_id ? "user" : r.family_id ? "family" : "school",
      ...stripeLinks({ stripe_subscription_id: String(r.stripe_subscription_id), stripe_customer_id: String(r.stripe_customer_id) }),
    };
  }

  const bestSub = (subs: AdminSubscription[]) =>
    [...subs].sort((a, b) => Number(OPEN.includes(b.status)) - Number(OPEN.includes(a.status)) || (b.current_period_end ?? "").localeCompare(a.current_period_end ?? ""))[0] ?? null;

  interface Related { schools: Map<string, AdminSchoolRef[]>; subs: Map<string, AdminSubscription[]>; families: Map<string, Row[]>; classes: Map<string, { id: string; name: string; school_id: string | null; as: "student" | "teacher" }[]> }

  async function related(ids: string[]): Promise<Related> {
    const [members, taught, admins, teachers, fams, ownSubs] = await Promise.all([
      inIds("class_members", "student_id, class_id", "student_id", ids),
      inIds("classes", "id, teacher_id, school_id, name", "teacher_id", ids),
      inIds("school_admins", "user_id, school_id", "user_id", ids),
      inIds("school_teachers", "user_id, school_id", "user_id", ids),
      inIds("family_members", "user_id, family_id, role, status", "user_id", ids),
      inIds("billing_subscriptions", "*", "user_id", ids),
    ]);
    const studentClasses = await inIds("classes", "id, school_id, name", "id", [...new Set(members.map((m) => String(m.class_id)))]);
    const classById = new Map(studentClasses.map((c) => [String(c.id), c]));
    const activeFams = fams.filter((f) => f.status !== "removed");
    const familyIds = [...new Set(activeFams.map((f) => String(f.family_id)))];
    const [famSubs, famRows] = await Promise.all([inIds("billing_subscriptions", "*", "family_id", familyIds), inIds("families", "id, name", "id", familyIds)]);
    const famName = new Map(famRows.map((f) => [String(f.id), String(f.name)]));

    const refs: { user: string; school: string; via: AdminSchoolRef["via"] }[] = [];
    const classes = new Map<string, Related["classes"] extends Map<string, infer V> ? V : never>();
    const pushClass = (u: string, c: Related["classes"] extends Map<string, (infer V)[]> ? V : never) => classes.set(u, [...(classes.get(u) ?? []), c]);
    for (const m of members) {
      const c = classById.get(String(m.class_id));
      if (!c) continue;
      pushClass(String(m.student_id), { id: String(c.id), name: String(c.name), school_id: (c.school_id as string) ?? null, as: "student" });
      if (c.school_id) refs.push({ user: String(m.student_id), school: String(c.school_id), via: "class" });
    }
    for (const c of taught) {
      pushClass(String(c.teacher_id), { id: String(c.id), name: String(c.name), school_id: (c.school_id as string) ?? null, as: "teacher" });
      if (c.school_id) refs.push({ user: String(c.teacher_id), school: String(c.school_id), via: "teacher" });
    }
    for (const a of admins) refs.push({ user: String(a.user_id), school: String(a.school_id), via: "admin" });
    for (const t of teachers) refs.push({ user: String(t.user_id), school: String(t.school_id), via: "teacher" });
    const schoolRows = await inIds("schools", "id, name", "id", [...new Set(refs.map((r) => r.school))]);
    const schoolName = new Map(schoolRows.map((s) => [String(s.id), String(s.name)]));

    const schools = new Map<string, AdminSchoolRef[]>();
    for (const r of refs) {
      const list = schools.get(r.user) ?? [];
      if (!list.some((s) => s.id === r.school && s.via === r.via)) list.push({ id: r.school, name: schoolName.get(r.school) ?? "?", via: r.via });
      schools.set(r.user, list);
    }
    const subs = new Map<string, AdminSubscription[]>();
    for (const s of ownSubs) subs.set(String(s.user_id), [...(subs.get(String(s.user_id)) ?? []), toSub(s)]);
    for (const f of activeFams) {
      const list = famSubs.filter((s) => String(s.family_id) === String(f.family_id)).map(toSub);
      if (list.length) subs.set(String(f.user_id), [...(subs.get(String(f.user_id)) ?? []), ...list]);
    }
    const families = new Map<string, Row[]>();
    for (const f of fams) families.set(String(f.user_id), [...(families.get(String(f.user_id)) ?? []), { ...f, name: famName.get(String(f.family_id)) ?? "" }]);
    return { schools, subs, families, classes };
  }

  function row(u: User, f: Facts, rel: Related, access: AccessInfo | null): AdminUserRow {
    const a = f.access.get(u.id);
    return {
      id: u.id, email: u.email ?? null, name: nameOf(u.id, f), role: roleOf(u.id, f),
      account_type: (f.profiles.get(u.id)?.account_type as string) ?? null,
      schools: rel.schools.get(u.id) ?? [], created_at: u.created_at ?? null, last_sign_in_at: u.last_sign_in_at ?? null,
      trial_ends_at: (a?.trial_ends_at as string) ?? null, free_access_until: (a?.free_access_until as string) ?? null,
      blocked: Boolean(a?.blocked_at), access_state: access?.state ?? null, access_reason: access?.reason ?? null,
      subscription: bestSub(rel.subs.get(u.id) ?? []),
      mfa: (u.factors ?? []).some((x) => x.status === "verified"),
    };
  }

  async function rows(users: User[], f: Facts, withAccess = true): Promise<AdminUserRow[]> {
    const rel = await related(users.map((u) => u.id));
    const access = withAccess ? await mapLimit(users, 8, (u) => appAccess(u.id)) : users.map(() => null);
    return users.map((u, i) => row(u, f, rel, access[i]));
  }

  async function audit(filter: AuditFilter): Promise<Paged<AuditEntry>> {
    let q = db.from("admin_audit_log").select("*", { count: "exact" }).order("id", { ascending: false })
      .range((filter.page - 1) * filter.pageSize, filter.page * filter.pageSize - 1);
    if (filter.action) q = filter.action.includes(".") ? q.like("action", `${filter.action}%`) : q.like("action", `%${filter.action}%`);
    if (filter.admin_id) q = q.eq("admin_id", filter.admin_id);
    if (filter.target_user) q = q.eq("target_user", filter.target_user);
    if (filter.target_school) q = q.eq("target_school", filter.target_school);
    if (filter.since) q = q.gte("at", `${filter.since}T00:00:00Z`);
    const { data, error, count } = await q;
    if (error) { if (MISSING.includes(error.code ?? "")) return { items: [], total: 0, page: filter.page, page_size: filter.pageSize }; dbFail("admin_audit_log", error); }
    const items = (data ?? []) as AuditEntry[];
    const adminIds = [...new Set(items.map((e) => e.admin_id).filter((x): x is string => Boolean(x)))];
    const emails = new Map(await Promise.all(adminIds.map(async (id) => [id, (await authUser(id))?.email ?? null] as const)));
    return { items: items.map((e) => ({ ...e, admin_email: e.admin_id ? emails.get(e.admin_id) ?? null : null })), total: count ?? items.length, page: filter.page, page_size: filter.pageSize };
  }

  async function people(ids: string[]): Promise<AdminSchoolPerson[]> {
    const f = await facts(ids);
    return mapLimit(ids, 8, async (id) => {
      const u = await authUser(id);
      return { user_id: id, email: u?.email ?? null, name: nameOf(id, f), created_at: u?.created_at ?? null };
    });
  }

  const store: AdminStore = {
    async verifyToken(token): Promise<VerifiedUser | null> {
      const { data, error } = await db.auth.getUser(token);
      if (error || !data.user) return null;
      const u = data.user;
      return { id: u.id, email: u.email ?? null, googleVerified: googleVerified(u), mfaEnrolled: (u.factors ?? []).some((f) => f.status === "verified") };
    },

    async isPlatformAdmin(userId) {
      const { data, error } = await db.from("platform_admins").select("user_id").eq("user_id", userId).maybeSingle();
      if (error) { if (MISSING.includes(error.code ?? "")) return false; dbFail("platform_admins", error); }
      return Boolean(data);
    },

    async listUsers(filter: UserListFilter) {
      const [users, f] = await Promise.all([authUsers(), facts(null)]);
      const now = Date.now();
      const q = filter.q;
      const matches = users.filter((u) => {
        if (q && !(u.id === q || (u.email ?? "").toLowerCase().includes(q) || (nameOf(u.id, f) ?? "").toLowerCase().includes(q))) return false;
        if (filter.role !== "all" && roleOf(u.id, f) !== filter.role) return false;
        const a = f.access.get(u.id);
        const t = (k: string) => (a?.[k] ? Date.parse(String(a[k])) : NaN);
        switch (filter.state) {
          case "blocked": return Boolean(a?.blocked_at);
          case "grant": return t("free_access_until") > now;
          case "trial": return !a?.blocked_at && t("trial_ends_at") > now;
          case "trial_over": return t("trial_ends_at") <= now;
          default: return true;
        }
      }).sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
      const sub = filter.sub ?? "all";
      const school = filter.school ?? "all";
      if (sub !== "all" || school !== "all") {
        const rel = await related(matches.map((u) => u.id));
        const kept = matches.filter((u) => {
          const open = (rel.subs.get(u.id) ?? []).some((x) => OPEN.includes(x.status));
          if (sub === "active" && !open) return false;
          if (sub === "none" && open) return false;
          const schools = rel.schools.get(u.id) ?? [];
          if (school === "none" && schools.length) return false;
          if (school !== "all" && school !== "none" && !schools.some((x) => x.id === school)) return false;
          return true;
        });
        matches.splice(0, matches.length, ...kept);
      }
      const slice = matches.slice((filter.page - 1) * filter.pageSize, filter.page * filter.pageSize);
      return { items: await rows(slice, f), total: matches.length, page: filter.page, page_size: filter.pageSize };
    },

    async getUser(userId): Promise<AdminUserDetail | null> {
      const u = await authUser(userId);
      if (!u) return null;
      const f = await facts([userId]);
      const rel = await related([userId]);
      const [access, isAdmin, log] = await Promise.all([appAccess(userId), store.isPlatformAdmin(userId),
        audit({ page: 1, pageSize: 20, action: null, admin_id: null, target_user: userId, target_school: null, since: null })]);
      return {
        ...row(u, f, rel, access), access, account_access: (f.access.get(userId) as unknown as AccountAccessRow) ?? null,
        subscriptions: rel.subs.get(userId) ?? [],
        families: (rel.families.get(userId) ?? []).map((x) => ({ id: String(x.family_id), name: String(x.name ?? ""), role: String(x.role), status: String(x.status) })),
        classes: rel.classes.get(userId) ?? [], platform_admin: isAdmin, audit: log.items,
      };
    },

    async userBasics(userId) {
      const u = await authUser(userId);
      return u ? { id: u.id, email: u.email ?? null, created_at: u.created_at ?? null } : null;
    },

    async getAccess(userId) {
      const { data, error } = await db.from("account_access").select("*").eq("user_id", userId).maybeSingle();
      if (error) dbFail("account_access", error);
      return (data ?? null) as AccountAccessRow | null;
    },

    async updateAccess(userId, patch, adminId) {
      const values = { ...patch, updated_at: new Date().toISOString(), updated_by: adminId };
      const { data, error } = await db.from("account_access").update(values).eq("user_id", userId).select("*");
      if (error) dbFail("account_access", error);
      if (data && data.length) return data[0] as AccountAccessRow;
      // No row yet (user from before the trigger existed): create it with the regular trial from signup.
      const u = await authUser(userId);
      const start = u?.created_at ?? new Date().toISOString();
      const insert = { user_id: userId, trial_started_at: start, trial_ends_at: new Date(Date.parse(start) + 7 * 86_400_000).toISOString(), ...values };
      const created = await db.from("account_access").insert(insert).select("*").single();
      if (created.error) dbFail("account_access", created.error);
      return created.data as AccountAccessRow;
    },

    async deleteAccount(userId) {
      await deleteAccountPath(db, userId);
    },

    async recentSignups(days) {
      const since = Date.now() - days * 86_400_000;
      const users = (await authUsers()).filter((u) => Date.parse(u.created_at ?? "") >= since)
        .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? "")).slice(0, 500);
      const ids = users.map((u) => u.id);
      return rows(users, await facts(ids), users.length <= 100);
    },

    async listSchools(q) {
      const schools = (await all("schools", "id, name, canton_or_state, country, created_at", "name"))
        .filter((s) => !q || String(s.name).toLowerCase().includes(q) || String(s.id) === q);
      const ids = schools.map((s) => String(s.id));
      const [lics, classes, admins, teachers] = await Promise.all([
        inIds("school_licences", "*", "school_id", ids), inIds("classes", "id, school_id, archived", "school_id", ids),
        inIds("school_admins", "school_id, user_id", "school_id", ids), inIds("school_teachers", "school_id, user_id", "school_id", ids),
      ]);
      const live = classes.filter((c) => !c.archived);
      const members = await inIds("class_members", "class_id, student_id", "class_id", live.map((c) => String(c.id)));
      const schoolOfClass = new Map(live.map((c) => [String(c.id), String(c.school_id)]));
      const students = new Map<string, Set<string>>();
      for (const m of members) {
        const s = schoolOfClass.get(String(m.class_id));
        if (s) students.set(s, (students.get(s) ?? new Set()).add(String(m.student_id)));
      }
      const count = (list: Row[], id: string) => list.filter((r) => String(r.school_id) === id).length;
      return schools.map((s): AdminSchoolRow => {
        const id = String(s.id);
        return {
          id, name: String(s.name), canton_or_state: String(s.canton_or_state ?? ""), country: String(s.country ?? "CH"), created_at: String(s.created_at),
          licence: currentLicence(lics.filter((l) => String(l.school_id) === id).map(toLicence)),
          students: students.get(id)?.size ?? 0, admins: count(admins, id), teachers: count(teachers, id),
        };
      });
    },

    async getSchool(schoolId): Promise<AdminSchoolDetail | null> {
      const { data: s, error } = await db.from("schools").select("id, name, canton_or_state, country, created_at").eq("id", schoolId).maybeSingle();
      if (error) dbFail("schools", error);
      if (!s) return null;
      const [lics, classes, adminIds, teacherIds] = await Promise.all([
        inIds("school_licences", "*", "school_id", [schoolId]), inIds("classes", "id, name, teacher_id, archived", "school_id", [schoolId]),
        store.schoolAdmins(schoolId), store.schoolTeachers(schoolId),
      ]);
      const members = await inIds("class_members", "class_id, student_id", "class_id", classes.map((c) => String(c.id)));
      const licences = lics.map(toLicence).sort((a, b) => b.created_at.localeCompare(a.created_at));
      const [adminUsers, teacherUsers, log] = await Promise.all([people(adminIds), people(teacherIds),
        audit({ page: 1, pageSize: 20, action: null, admin_id: null, target_user: null, target_school: schoolId, since: null })]);
      const live = new Set(classes.filter((c) => !c.archived).map((c) => String(c.id)));
      return {
        id: String(s.id), name: String(s.name), canton_or_state: String(s.canton_or_state ?? ""), country: String(s.country ?? "CH"), created_at: String(s.created_at),
        licence: currentLicence(licences), licences,
        students: new Set(members.filter((m) => live.has(String(m.class_id))).map((m) => String(m.student_id))).size,
        admins: adminIds.length, teachers: teacherIds.length, admin_users: adminUsers, teacher_users: teacherUsers,
        classes: classes.map((c) => ({ id: String(c.id), name: String(c.name), teacher_id: String(c.teacher_id), archived: Boolean(c.archived), students: members.filter((m) => String(m.class_id) === String(c.id)).length })),
        audit: log.items,
      };
    },

    async createSchool(input) {
      const { data, error } = await db.rpc("platform_create_school", { p_name: input.name, p_canton_or_state: input.canton_or_state, p_country: input.country });
      if (error || typeof data !== "string") dbFail("platform_create_school", error);
      return data as string;
    },

    async getLicence(licenceId) {
      const { data, error } = await db.from("school_licences").select("*").eq("id", licenceId).maybeSingle();
      if (error) dbFail("school_licences", error);
      return data ? toLicence(data as Row) : null;
    },

    async assignLicence(schoolId, input: LicenceInput) {
      const { data, error } = await db.rpc("platform_assign_licence", {
        p_school_id: schoolId, p_package: input.package, p_status: input.status, p_student_limit: input.student_limit,
        p_start: input.start, p_end: input.end, p_billing_interval: input.billing_interval, p_notes: input.notes,
      });
      if (error || typeof data !== "string") dbFail("platform_assign_licence", error);
      return data as string;
    },

    async updateLicence(licenceId, patch) {
      const { data, error } = await db.from("school_licences").update(patch).eq("id", licenceId).select("*").single();
      if (error) dbFail("school_licences", error);
      return toLicence(data as Row);
    },

    async findUserIdByEmail(email) {
      const u = (await authUsers()).find((x) => (x.email ?? "").toLowerCase() === email);
      return u?.id ?? null;
    },

    async schoolAdmins(schoolId) {
      return (await inIds("school_admins", "user_id", "school_id", [schoolId])).map((r) => String(r.user_id));
    },
    async schoolTeachers(schoolId) {
      return (await inIds("school_teachers", "user_id", "school_id", [schoolId])).map((r) => String(r.user_id));
    },

    async addSchoolAdmin(schoolId, email) {
      // p_make_role: pure admins (no classes, not teachers) get the role label 'school_admin' (FLOW-ANALYSIS G6).
      const { data, error } = await db.rpc("platform_add_school_admin", { p_school_id: schoolId, p_email: email, p_make_role: true });
      if (error) dbFail("platform_add_school_admin", error);
      const id = String(data);
      // G6: the role was decided by WendApply, so the app must never send this person to the role picker.
      const u = await authUser(id);
      if (u && u.user_metadata?.role_confirmed !== true) {
        const upd = await db.auth.admin.updateUserById(id, { user_metadata: { ...(u.user_metadata ?? {}), role_confirmed: true } });
        if (upd.error) dbFail("auth.users", { code: upd.error.code ?? upd.error.name });
      }
      return id;
    },
    async removeSchoolAdmin(schoolId, userId) {
      const { error } = await db.from("school_admins").delete().eq("school_id", schoolId).eq("user_id", userId);
      if (error) dbFail("school_admins", error);
    },
    async addSchoolTeacher(schoolId, userId, adminId) {
      const { error } = await db.from("school_teachers").insert({ school_id: schoolId, user_id: userId, added_by: adminId });
      if (error) dbFail("school_teachers", error);
    },
    async removeSchoolTeacher(schoolId, userId) {
      const { error } = await db.from("school_teachers").delete().eq("school_id", schoolId).eq("user_id", userId);
      if (error) dbFail("school_teachers", error);
    },

    async writeAudit(entry) {
      const { error } = await db.from("admin_audit_log").insert({
        admin_id: entry.admin_id, action: entry.action, target_user: entry.target_user ?? null, target_school: entry.target_school ?? null,
        details: entry.details, ip: entry.ip,
      });
      if (error) dbFail("admin_audit_log", error);
    },

    listAudit: audit,
  };
  return store;
}

let api: AdminApi | null = null;

/** Lazily built API (the service client is only created on the first request that passes the IP brake). */
export function adminApi(): AdminApi {
  if (api) return api;
  let made: AdminStore | null = null;
  const store = new Proxy({} as AdminStore, { get: (_t, prop) => Reflect.get((made ??= supabaseAdminStore()), prop) });
  api = createAdminApi({ store, rpc: (...args) => defaultRateLimitRpc()(...args) });
  return api;
}
