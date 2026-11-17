// LIVE row-level-security audit against the real Supabase project (security audit 2026-11-17).
// Skipped unless RLS_LIVE_URL, RLS_LIVE_ANON_KEY and RLS_LIVE_SERVICE_ROLE_KEY are set (never in CI, never committed):
//   set -a; . /path/outside/repo/live.env; set +a; node --test tests/rls-live.test.mjs
// What it does: creates two clearly-named throwaway users (rls-audit-*@example.com), lets user B create own rows
// (profile, application, cv, reminder settings, push subscription, calendar feed, storage files, a family), then checks
// as anon and as user A that nothing of B (or of any real user) is readable or writable. Everything of the throwaway users
// is deleted at the end (auth user delete cascades; storage files removed explicitly). No real user's data is touched:
// A's write attempts are aimed only at B's throwaway rows, and every assertion on real data is read-only.
import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.RLS_LIVE_URL, ANON = process.env.RLS_LIVE_ANON_KEY, SERVICE = process.env.RLS_LIVE_SERVICE_ROLE_KEY;
const live = Boolean(URL_ && ANON && SERVICE);
const skip = live ? false : "set RLS_LIVE_URL / RLS_LIVE_ANON_KEY / RLS_LIVE_SERVICE_ROLE_KEY to run the live RLS audit";

/** Every table in schema public (2026-11-17) with the columns that name its owner. Catalogs are readable by design. */
export const TABLES = {
  ai_review_user_settings: ["user_id"], ai_reviews: ["user_id"], application_documents: ["user_id"], applications: ["user_id"],
  billing_customers: ["created_by"], billing_subscriptions: [], calendar_feeds: ["user_id"], class_announcements: [],
  class_deadlines: ["created_by"], class_goals: ["created_by"], class_invitations: ["created_by"], class_members: ["student_id"],
  class_notifications: ["user_id"], class_student_aliases: ["student_id"], class_teachers: ["teacher_id"],
  class_view_log: ["student_id", "teacher_id"], classes: ["teacher_id"], cvs: ["user_id"], families: ["created_by"],
  family_invites: ["created_by"], family_members: ["user_id"], friendships: ["requester_id", "addressee_id"],
  map_application_rewards: ["user_id"], map_island_catalog: null, map_islands: ["user_id"], map_items: ["user_id"],
  map_layouts: ["user_id"], map_shop_catalog: null, map_wallets: ["user_id"], profiles: ["user_id"],
  push_subscriptions: ["user_id"], reminder_log: ["user_id"], reminder_settings: ["user_id"], school_admins: ["user_id"],
  school_licences: [], schools: [], stripe_events: [], user_roles: ["user_id"], waitlist_requests: ["user_id"],
};

const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const tag = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
let admin, anon, A, B, idA, idB, famB = null;
const created = [];

async function makeUser(label) {
  const email = `rls-audit-${label}-${tag}@example.com`, password = `Rls-${tag}-${label}-Pw!9`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { rls_audit: true } });
  if (error) throw error;
  created.push(data.user.id);
  const client = createClient(URL_, ANON, opts);
  const s = await client.auth.signInWithPassword({ email, password });
  if (s.error) throw s.error;
  return { client, id: data.user.id };
}

before(async () => {
  if (!live) return;
  admin = createClient(URL_, SERVICE, opts);
  anon = createClient(URL_, ANON, opts);
  ({ client: A, id: idA } = await makeUser("a"));
  ({ client: B, id: idB } = await makeUser("b"));
  // B's own data (all as B, through RLS).
  const must = async (p, what) => { const { error } = await p; assert.equal(error, null, `${what}: ${error?.message}`); };
  await must(B.from("profiles").upsert({ id: `p-${idB}`, user_id: idB, first_name: "RLS", last_name: "Audit B", email: "b@example.com" }), "B profile");
  await must(B.from("applications").insert({ id: `rls-app-${tag}`, user_id: idB, company: "RLS Audit AG", position: "Test", category: "other", status: "draft", created_at: "2026-11-17", updated_at: "2026-11-17", job_url: "https://example.com", deadline: "2030-01-01" }), "B application");
  await must(B.from("cvs").insert({ id: `rls-cv-${tag}`, user_id: idB, name: "RLS CV", type: "general", description: "rls", updated_at: "2026-11-17", status: "active", kind: "lebenslauf" }), "B cv");
  await must(B.from("reminder_settings").upsert({ user_id: idB }), "B reminder settings");
  await must(B.from("push_subscriptions").insert({ user_id: idB, endpoint: `https://push.example.com/${tag}`, p256dh: "x", auth: "y" }), "B push");
  await must(B.from("calendar_feeds").insert({ user_id: idB, token: `rlsaudit${tag}${"x".repeat(24)}` }), "B feed");
  await must(B.storage.from("cvs").upload(`${idB}/rls-${tag}.pdf`, new Blob(["%PDF-1.4 rls audit"], { type: "application/pdf" })), "B cv file");
  await must(B.storage.from("avatars").upload(`${idB}/rls-${tag}.png`, new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" })), "B avatar");
  await must(B.rpc("account_set_type", { p_type: "parent", p_birth_year: null }), "B becomes a parent account");
  const fam = await B.rpc("family_create", { p_name: `RLS Audit ${tag}` });
  famB = fam.error ? null : (typeof fam.data === "string" ? fam.data : (fam.data?.id ?? null));
  if (!famB) {
    const { data } = await admin.from("family_members").select("family_id").eq("user_id", idB).maybeSingle();
    famB = data?.family_id ?? null;
  }
});

after(async () => {
  if (!live) return;
  await admin.storage.from("cvs").remove([`${idB}/rls-${tag}.pdf`, `${idA}/rls-${tag}.pdf`]).catch(() => {});
  await admin.storage.from("avatars").remove([`${idB}/rls-${tag}.png`, `${idA}/rls-${tag}.png`]).catch(() => {});
  if (famB) await admin.from("families").delete().eq("id", famB);
  for (const id of created) await admin.auth.admin.deleteUser(id);
  for (const id of created) { // nothing of the throwaway users may survive
    for (const [t, cols] of Object.entries(TABLES)) for (const c of cols ?? []) {
      const { count } = await admin.from(t).select("*", { count: "exact", head: true }).eq(c, id);
      assert.equal(count ?? 0, 0, `cleanup: ${t}.${c} still has rows of a throwaway user`);
    }
  }
});

test("setup: B owns a family, so the family / billing checks below are not vacuous", { skip }, () => {
  assert.ok(famB, "family_create for the throwaway parent failed");
});

const denied = (r) => Boolean(r.error) || (r.data ?? []).length === 0;

test("anon: every public table is unreadable (permission denied or 0 rows)", { skip }, async () => {
  for (const t of Object.keys(TABLES)) {
    const r = await anon.from(t).select("*").limit(5);
    assert.ok(denied(r), `anon can read ${t} (${r.data?.length} rows)`);
  }
});

test("anon: cannot insert into any table", { skip }, async () => {
  for (const t of Object.keys(TABLES)) {
    const r = await anon.from(t).insert({});
    assert.ok(r.error, `anon insert into ${t} did not fail`);
  }
});

test("anon: authenticated-only RPCs are not executable", { skip }, async () => {
  for (const fn of ["export_my_data", "family_get_my", "family_export_my_data", "social_list", "map_shop_state", "teacher_dashboard",
    "class_list_mine", "school_admin_my_schools", "account_delete_summary", "my_notifications", "profile_name_status"]) {
    const r = await anon.rpc(fn);
    assert.ok(r.error, `anon could call ${fn}`);
  }
  for (const [fn, args] of [["billing_status_for_family", { p_family_id: famB ?? idB }], ["is_family_parent", { p_family_id: famB ?? idB }],
    ["family_child_overview", { p_child_id: idB }], ["map_friend_island", { p_friend_id: idB }], ["social_avatars", { p_user_ids: [idB] }]]) {
    const r = await anon.rpc(fn, args);
    assert.ok(r.error, `anon could call ${fn}`);
  }
});

test("anon: service-only functions are not executable", { skip }, async () => {
  for (const [fn, args] of [["billing_apply_subscription", {}], ["admin_assign_family_plan", {}], ["platform_create_school", { p_name: "x", p_canton: "ZH", p_contact_email: "x@example.com" }],
    ["account_delete_prepare", { p_user_id: idB }], ["account_data_report", { p_user_id: idB }]]) {
    for (const c of [anon, A]) {
      const r = await c.rpc(fn, args);
      assert.ok(r.error, `${c === anon ? "anon" : "user"} could call ${fn}`);
    }
  }
});

test("user A sees only own rows in every table (incl. billing, stripe_events, school_licences, family tables)", { skip }, async () => {
  for (const [t, cols] of Object.entries(TABLES)) {
    const r = await A.from(t).select("*").limit(200);
    if (r.error) continue; // permission denied = fine
    if (cols === null) continue; // catalogs
    for (const row of r.data) {
      assert.ok(cols.length && cols.some((c) => row[c] === idA), `A can read a foreign row in ${t}`);
    }
  }
});

test("user A cannot read B's rows by id (IDOR through PostgREST filters)", { skip }, async () => {
  for (const [t, cols] of Object.entries(TABLES)) for (const c of cols ?? []) {
    const r = await A.from(t).select("*").eq(c, idB);
    assert.ok(denied(r), `A reads B's ${t} via ${c}`);
  }
  assert.ok(denied(await A.from("applications").select("*").eq("id", `rls-app-${tag}`)));
  if (famB) {
    for (const t of ["families", "family_members", "family_invites", "billing_customers", "billing_subscriptions", "school_licences"]) {
      const r = await A.from(t).select("*").eq(t === "families" ? "id" : "family_id", famB);
      assert.ok(denied(r), `A reads B's family data in ${t}`);
    }
  }
});

test("user A cannot update / delete B's rows", { skip }, async () => {
  const before = (await B.from("applications").select("company").eq("id", `rls-app-${tag}`).single()).data;
  await A.from("applications").update({ company: "pwned" }).eq("id", `rls-app-${tag}`);
  await A.from("applications").delete().eq("id", `rls-app-${tag}`);
  await A.from("cvs").delete().eq("id", `rls-cv-${tag}`);
  await A.from("profiles").update({ first_name: "pwned" }).eq("user_id", idB);
  await A.from("push_subscriptions").delete().eq("user_id", idB);
  await A.from("calendar_feeds").delete().eq("user_id", idB);
  await A.from("reminder_settings").update({ email: true }).eq("user_id", idB);
  const after_ = (await B.from("applications").select("company").eq("id", `rls-app-${tag}`).single()).data;
  assert.deepEqual(after_, before);
  assert.equal((await B.from("cvs").select("id").eq("id", `rls-cv-${tag}`)).data.length, 1);
  assert.equal((await B.from("profiles").select("first_name").eq("user_id", idB).single()).data.first_name, "RLS");
  assert.equal((await B.from("push_subscriptions").select("id").eq("user_id", idB)).data.length, 1);
  assert.equal((await B.from("calendar_feeds").select("id").eq("user_id", idB)).data.length, 1);
});

test("user A cannot insert rows owned by B or take over B's push endpoint", { skip }, async () => {
  for (const [t, row] of [["applications", { id: `rls-x-${tag}`, user_id: idB, company: "x", position: "x" }], ["cvs", { id: `rls-x-${tag}`, user_id: idB, name: "x" }],
    ["profiles", { id: `rls-x-${tag}`, user_id: idB }], ["reminder_settings", { user_id: idB }], ["calendar_feeds", { user_id: idB, token: `x${tag}${"y".repeat(30)}` }],
    ["push_subscriptions", { user_id: idB, endpoint: `https://push.example.com/x${tag}`, p256dh: "x", auth: "y" }]]) {
    assert.ok((await A.from(t).insert(row)).error, `A inserted a ${t} row for B`);
  }
  const r = await A.from("push_subscriptions").upsert({ user_id: idA, endpoint: `https://push.example.com/${tag}`, p256dh: "a", auth: "a" }, { onConflict: "endpoint" });
  assert.ok(r.error, "A took over B's push endpoint");
  // A cannot link B's application to its own cv
  const own = await A.from("cvs").insert({ id: `rls-cva-${tag}`, user_id: idA, name: "A", type: "general", description: "rls", updated_at: "2026-11-17", status: "active", kind: "lebenslauf" });
  assert.equal(own.error, null);
  assert.ok((await A.from("application_documents").insert({ application_id: `rls-app-${tag}`, document_id: `rls-cva-${tag}`, user_id: idA })).error);
});

test("user A cannot escalate own privileges through tables (roles, wallets, licences, account type)", { skip }, async () => {
  assert.ok((await A.from("map_wallets").upsert({ user_id: idA, balance: 999999, earned: 999999 })).error, "A wrote its wallet");
  assert.ok((await A.from("school_admins").insert({ user_id: idA, school_id: idA })).error, "A made itself school admin");
  assert.ok((await A.from("school_licences").insert({ school_id: idA, plan: "school" })).error, "A created a licence");
  assert.ok((await A.from("billing_subscriptions").insert({ stripe_subscription_id: `sub_${tag}` })).error, "A created a subscription");
  assert.ok((await A.from("stripe_events").insert({ id: `evt_${tag}`, type: "x" })).error, "A wrote stripe_events");
  assert.ok((await A.from("ai_review_user_settings").upsert({ user_id: idA, daily_limit: 9999 })).error, "A raised its AI limit");
  await A.from("profiles").upsert({ id: `p-${idA}`, user_id: idA, account_type: "teacher", birth_year: 1900 });
  const p = (await admin.from("profiles").select("account_type,birth_year").eq("user_id", idA).maybeSingle()).data;
  assert.notEqual(p?.account_type, "teacher");
  assert.notEqual(p?.birth_year, 1900);
});

test("security-definer RPCs refuse B's ids for A", { skip }, async () => {
  if (famB) {
    assert.equal((await A.rpc("is_family_parent", { p_family_id: famB })).data, false);
    const s = await A.rpc("billing_status_for_family", { p_family_id: famB });
    assert.ok(s.error || s.data === null, "A reads B's family billing status");
    assert.equal((await B.rpc("is_family_parent", { p_family_id: famB })).data, true, "sanity: B is parent of own family");
  }
  const child = await A.rpc("family_child_overview", { p_child_id: idB });
  assert.ok(child.error || child.data === null || (Array.isArray(child.data) && !child.data.length), "A reads B via family_child_overview");
  const isl = await A.rpc("map_friend_island", { p_friend_id: idB });
  assert.ok(isl.error || isl.data === null || (Array.isArray(isl.data) && !isl.data.length), "A reads B's island without friendship");
  const exp = await A.rpc("export_my_data");
  assert.equal(exp.error, null);
  assert.ok(!JSON.stringify(exp.data).includes(idB), "A's export contains B");
});

test("storage: A cannot read, list, overwrite or delete B's files; cv bucket is private", { skip }, async () => {
  assert.ok((await A.storage.from("cvs").download(`${idB}/rls-${tag}.pdf`)).error, "A downloads B's cv");
  assert.equal(((await A.storage.from("cvs").list(idB)).data ?? []).length, 0, "A lists B's cvs");
  assert.ok((await A.storage.from("cvs").upload(`${idB}/evil-${tag}.pdf`, new Blob(["x"], { type: "application/pdf" }))).error, "A uploads into B's cv folder");
  assert.ok((await A.storage.from("avatars").upload(`${idB}/rls-${tag}.png`, new Blob(["x"], { type: "image/png" }), { upsert: true })).error, "A overwrites B's avatar");
  await A.storage.from("cvs").remove([`${idB}/rls-${tag}.pdf`]);
  assert.equal((await B.storage.from("cvs").download(`${idB}/rls-${tag}.pdf`)).error, null, "B's cv was deleted by A");
  assert.ok((await anon.storage.from("cvs").download(`${idB}/rls-${tag}.pdf`)).error, "anon downloads a cv");
  const pub = await fetch(`${URL_}/storage/v1/object/public/cvs/${idB}/rls-${tag}.pdf`);
  assert.notEqual(pub.status, 200, "cvs bucket is public");
});
