// 20261119120000_purge_unconfirmed_7d.sql: admin.purge_unconfirmed_users deletes ONLY never-confirmed, never-signed-in sign-ups
// older than 7 days without real data; releases their trial ledger row, logs hashes + an audit row; dry run deletes nothing;
// anon / authenticated cannot run it; the per-run cap aborts. PGlite has no pg_cron → the schedule step is skipped (notice).
import { test } from "node:test";
import assert from "node:assert/strict";
import { setupAccessDb } from "./helpers/access-db.mjs";

const DAY = 86400000;
const ago = (days) => new Date(Date.now() - days * DAY).toISOString();

async function world() {
  const db = await setupAccessDb({ supabaseDefaults: true });
  // the Supabase auth.users columns the rule reads (the shared stub only has the ones older tests need)
  await db.reset(); await db.database.exec(`alter table auth.users add column phone_confirmed_at timestamptz, add column last_sign_in_at timestamptz,
    add column confirmed_at timestamptz generated always as (least(email_confirmed_at, phone_confirmed_at)) stored;
    alter table storage.objects add column owner_id text`);
  const mk = async (n, days, extra = {}) => {
    const id = await db.user(n, { createdAt: ago(days), meta: { account_type: "independent_student" } });
    if (extra.confirmed) await db.admin("update auth.users set email_confirmed_at = now() - interval '1 day' where id = $1", [id]);
    if (extra.signedIn) await db.admin("update auth.users set last_sign_in_at = now() - interval '1 day' where id = $1", [id]);
    return id;
  };
  return { ...db, mk };
}
const exists = async (db, id) => (await db.admin("select count(*)::int n from auth.users where id = $1", [id]))[0].n === 1;
const purge = async (db, dry, days = 7) => (await db.admin("select admin.purge_unconfirmed_users($1, $2) r", [dry, days]))[0].r;

test("rule matrix: only old, unconfirmed, never-signed-in accounts without data are deleted", async () => {
  const db = await world();
  const plain = await db.mk(1, 10);
  const withApp = await db.mk(2, 10);
  await db.admin("insert into public.applications (id, user_id, company, position, category, status, created_at, updated_at) values ('a1', $1, 'Firma', 'Lehre', 'lehrstelle', 'offen', current_date, current_date)", [withApp])
  const withFile = await db.mk(3, 10);
  await db.admin("insert into storage.objects (bucket_id, name, owner) values ('documents', $1 || '/x.pdf', $1::uuid)", [withFile]);
  const withStripe = await db.mk(4, 10);
  await db.admin("insert into public.billing_customers (user_id, stripe_customer_id) values ($1, 'cus_probe')", [withStripe]);
  const withProfile = await db.mk(5, 10);
  await db.admin("update public.profiles set first_name = 'Mia' where user_id = $1", [withProfile]);
  const young = await db.mk(6, 3);
  const confirmed = await db.mk(7, 30, { confirmed: true });
  const signedIn = await db.mk(8, 30, { signedIn: true });
  const freeAccess = await db.mk(9, 10);
  await db.admin("update public.account_access set free_access_forever = true where user_id = $1", [freeAccess]);

  const dry = await purge(db, true);
  assert.equal(dry.dry_run, true);
  assert.equal(dry.candidates, 6); // 1,2,3,4,5,9 match the base rule
  assert.equal(dry.would_delete, 1);
  assert.equal(dry.kept_with_data, 5);
  assert.deepEqual(dry.ids, [plain]);
  assert.equal(dry.deleted, 0);
  for (const id of [plain, withApp, withFile, withStripe, withProfile, young, confirmed, signedIn, freeAccess]) assert.ok(await exists(db, id), "dry run deleted something");

  const ledgerBefore = (await db.admin("select count(*)::int n from public.trial_ledger"))[0].n;
  const real = await purge(db, false);
  assert.equal(real.deleted, 1);
  assert.equal(real.kept_with_data, 5);
  assert.equal(real.ids, undefined, "a real run returns no ids");
  assert.equal(await exists(db, plain), false);
  for (const id of [withApp, withFile, withStripe, withProfile, young, confirmed, signedIn, freeAccess]) assert.ok(await exists(db, id));
  // stub rows gone with the user, trial ledger row released
  assert.equal((await db.admin("select count(*)::int n from public.profiles where user_id = $1", [plain]))[0].n, 0);
  assert.equal((await db.admin("select count(*)::int n from public.account_access where user_id = $1", [plain]))[0].n, 0);
  assert.equal((await db.admin("select count(*)::int n from public.trial_ledger"))[0].n, ledgerBefore - 1);
  // audit + hashed log, no raw id / e-mail
  const audit = await db.admin("select admin_id, target_user, details from public.admin_audit_log where action = 'unconfirmed_signup_purged'");
  assert.equal(audit.length, 1);
  assert.equal(audit[0].admin_id, null); assert.equal(audit[0].target_user, null);
  assert.doesNotMatch(JSON.stringify(audit[0].details), new RegExp(plain));
  const log = await db.admin("select user_id_hash, email_hash, dry_run from admin.purged_unconfirmed_log order by id");
  assert.equal(log.length, 2); // dry + real
  assert.deepEqual(log.map((r) => r.dry_run), [true, false]);
  assert.match(log[1].user_id_hash, /^[0-9a-f]{64}$/);
  assert.doesNotMatch(JSON.stringify(log), /example\.test|00000000-0000/);

  assert.equal((await purge(db, false)).deleted, 0, "second run is a no-op");
});

test("days: a real run never uses less than 7 days; a dry run may look closer", async () => {
  const db = await world();
  const fiveDays = await db.mk(1, 5);
  const r = await purge(db, false, 1);
  assert.equal(r.days, 7); assert.equal(r.deleted, 0);
  assert.ok(await exists(db, fiveDays));
  const d = await purge(db, true, 1);
  assert.equal(d.days, 1); assert.deepEqual(d.ids, [fiveDays]);
  assert.ok(await exists(db, fiveDays));
});

test("anon and authenticated cannot run or see it; service_role can", async () => {
  const db = await world();
  for (const role of ["anon", "authenticated"]) {
    await db.reset(); await db.database.exec(`set role ${role}`);
    const err = await db.code(db.database.query("select admin.purge_unconfirmed_users(true, 7)"));
    assert.match(String(err), /permission denied/, role);
    const err2 = await db.code(db.database.query("select * from admin.purged_unconfirmed_log"));
    assert.match(String(err2), /permission denied/, role);
  }
  await db.asService();
  const r = (await db.q("select admin.purge_unconfirmed_users(true, 7) r"))[0].r;
  assert.equal(r.dry_run, true);
  await db.reset();
});

test("cap: more than 200 candidates aborts the run and deletes nothing", async () => {
  const db = await world();
  await db.admin(`insert into auth.users (id, email, raw_user_meta_data, created_at)
    select ('00000000-0000-4000-9000-' || lpad(g::text, 12, '0'))::uuid, 'cap' || g || '@example.test', '{}', now() - interval '10 days'
    from generate_series(1, 201) g`);
  const err = await db.code(purge(db, false));
  assert.match(String(err), /PURGE_CAP_EXCEEDED/);
  assert.equal((await db.admin("select count(*)::int n from auth.users"))[0].n, 201);
});
