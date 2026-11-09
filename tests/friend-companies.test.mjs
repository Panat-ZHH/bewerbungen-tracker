import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { cleanCompany, parseFriendIsland } from "../lib/friend-island.ts";

const read = (file) => readFile(new URL(file, import.meta.url), "utf8");

test("cleanCompany trims, strips control chars, caps at 80, rejects non-strings", () => {
  assert.equal(cleanCompany("  Swisscom \n AG "), "Swisscom AG");
  assert.equal(cleanCompany("a".repeat(200)).length, 80);
  for (const bad of [undefined, null, 5, {}, "", "   \n "]) assert.equal(cleanCompany(bad), undefined);
});

test("parseFriendIsland: company name only; no other application field survives", () => {
  const island = parseFriendIsland({
    userId: "u", displayName: "Mia", islands: 1, companiesShared: true,
    applications: [
      { id: "h0001", status: "applied", createdAt: "2026-10-01", company: "Acme AG", position: "CEO", location: "Bern", salary_min: 1, notes: "n", job_url: "http://x", deadline: "2026-12-01", cv_type: "cv" },
      { id: "h0002", status: "offer", company: "" }, { id: "h0003", status: "saved", company: 42 },
    ],
  });
  assert.deepEqual(island.applications.map((a) => a.company), ["Acme AG", "Haus 2", "Haus 3"]);
  const first = island.applications[0];
  assert.equal(first.position, ""); assert.equal(first.notes, undefined); assert.equal(first.location, undefined);
  assert.equal(first.salaryMin, undefined); assert.equal(first.jobUrl, undefined); assert.equal(first.deadline, undefined);
  assert.ok(!JSON.stringify(island).match(/CEO|Bern|http:\/\/x|2026-12-01/));
  assert.equal(parseFriendIsland({ userId: "u", applications: [], companiesShared: false }).companiesShared, false);
});

test("migration: only company is added; no other application column is referenced", async () => {
  const sql = await read("../supabase/migrations/20261106000000_friend_companies.sql");
  const code = sql.split("\n").filter((line) => !line.trim().startsWith("--")).join("\n");
  assert.doesNotMatch(code, /create policy|grant (select|insert|update|delete|all) on (table )?public\.applications|\b[a-z]\.(position|notes|location|salary_\w+|job_url|job_description|deadline|applied_at|cv_type|source|match_score)\b/i);
  assert.match(code, /f\.status = 'accepted'/);
  assert.match(code, /share_companies_with_friends/);
});

async function setup() {
  const database = new PGlite();
  await database.exec(`
    create role authenticated; create role anon; create schema auth; create schema storage;
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb);
    create function auth.uid() returns uuid language sql stable as $auth$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $auth$;
    create table storage.buckets (id text primary key, name text, public boolean);
    create table storage.objects (bucket_id text, name text);
    create function storage.foldername(text) returns text[] language sql as $storage$ select string_to_array($1, '/') $storage$;
    grant usage on schema auth to authenticated;
  `);
  for (const file of ["../supabase/schema.sql", "../supabase/social.sql", "../supabase/migrations/20261104000001_lock_streets.sql", "../supabase/migrations/20261104000002_islands.sql", "../supabase/migrations/20261105000001_friend_island_view.sql", "../supabase/migrations/20261106000000_friend_companies.sql"]) await database.exec(await read(file));
  return database;
}

test("database: friend gets company names only; stranger, pending and anonymous get nothing; owner switch hides names", async () => {
  const database = await setup();
  try {
    const [owner, friend, pending, stranger] = ["aaaaaaaa-0000-4000-8000-000000000001", "aaaaaaaa-0000-4000-8000-000000000002", "aaaaaaaa-0000-4000-8000-000000000003", "aaaaaaaa-0000-4000-8000-000000000004"];
    for (const [id, name] of [[owner, "Owner"], [friend, "Friend"], [pending, "Pending"], [stranger, "Stranger"]]) {
      await database.query("insert into auth.users (id) values ($1)", [id]);
      await database.query("insert into public.user_roles (user_id, display_name, invite_code) values ($1, $2, $2) on conflict (user_id) do update set display_name = excluded.display_name", [id, name]);
    }
    await database.query("insert into public.friendships (requester_id, addressee_id, status) values ($1,$2,'accepted'), ($3,$1,'pending')", [owner, friend, pending]);
    await database.query(`insert into public.applications (id, user_id, company, position, location, job_url, category, salary_min, salary_max, currency, deadline, status, applied_at, created_at, updated_at, cv_type, job_description, notes) values
      ('app-1', $1, '  Swisscom AG ', 'Geheim-Position', 'Geheim-Ort', 'https://geheim.example/job', 'software', 99123, 111321, 'CHF', '2027-01-02', 'interview', '2026-10-03', '2026-10-01', '2026-10-02', 'cv-geheim', 'Geheim-Beschreibung', 'Geheim-Notiz'),
      ('app-2', $1, 'UBS', 'Pos2', 'Ort2', null, 'software', null, null, null, null, 'applied', null, '2026-10-02', '2026-10-02', null, null, null)`, [owner]);
    const call = async (viewer, target) => { await database.exec("reset role"); await database.query("select set_config('request.jwt.claim.sub', $1, false)", [viewer ?? ""]); await database.exec("set role authenticated"); return database.query("select public.map_friend_island($1) as r", [target]); };

    // as friend: company names, nothing else
    const seen = (await call(friend, owner)).rows[0].r;
    assert.deepEqual(seen.applications.map((a) => a.company), ["Swisscom AG", "UBS"]);
    for (const a of seen.applications) assert.deepEqual(Object.keys(a).sort(), ["company", "createdAt", "id", "status"]);
    const text = JSON.stringify(seen);
    for (const secret of ["Geheim", "99123", "111321", "CHF", "2027-01-02", "cv-geheim", "app-1", "app-2", "Pos2", "Ort2", "2026-10-03"]) assert.ok(!text.includes(secret), secret);

    // as stranger / pending / anonymous: nothing
    await assert.rejects(call(stranger, owner), /NOT_FRIENDS/);
    await assert.rejects(call(pending, owner), /NOT_FRIENDS/);
    await assert.rejects(call(owner, pending), /NOT_FRIENDS/);
    await assert.rejects(call(null, owner), /AUTH_REQUIRED/);

    // friends can never read raw application rows or the sharing flag table directly
    await call(friend, owner);
    const raw = await database.query("select count(*)::int as n from public.applications");
    assert.equal(raw.rows[0].n, 0, "friend sees no raw application rows");
    const attempt = await database.query("update public.applications set company = 'x'").then((r) => r.affectedRows, () => 0);
    assert.equal(attempt, 0, "friend cannot modify raw application rows");

    // as owner: own rows via RLS (unchanged), and the island RPC refuses self
    await call(owner, friend).catch(() => {});
    const own = await database.query("select count(*)::int as n from public.applications");
    assert.equal(own.rows[0].n, 2, "owner still sees own rows");
    await assert.rejects(call(owner, owner), /NOT_FRIENDS/);

    // owner turns the company switch off -> houses stay, names vanish
    assert.equal((await database.query("select public.social_get_share_companies() as v")).rows[0].v, true);
    assert.equal((await database.query("select public.social_set_share_companies(false) as v")).rows[0].v, false);
    const hidden = (await call(friend, owner)).rows[0].r;
    assert.equal(hidden.applications.length, 2);
    assert.equal(hidden.companiesShared, false);
    for (const a of hidden.applications) assert.deepEqual(Object.keys(a).sort(), ["createdAt", "id", "status"]);
    assert.ok(!JSON.stringify(hidden).match(/Swisscom|UBS/));

    // a friend cannot flip the owner's switch (it only ever changes the caller's own row)
    await call(friend, owner);
    await database.query("select public.social_set_share_companies(true)");
    assert.ok(!JSON.stringify((await call(friend, owner)).rows[0].r).match(/Swisscom|UBS/), "friend's own toggle does not affect owner");
    await assert.rejects(call(null, owner).then(() => database.query("select public.social_set_share_companies(true)")), /AUTH_REQUIRED/);
  } finally { await database.close(); }
});
