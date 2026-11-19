#!/usr/bin/env node
// Lists (default) or deletes (--apply) sign-ups that were NEVER confirmed and NEVER signed in, older than N days (SPEC-DATA §3.11).
// MANUAL TOOL. The automatic daily purge (03:17 UTC, 7 days, approved by Panat 2026-11-19) runs inside the database via pg_cron:
// admin.purge_unconfirmed_users(false, 7) in supabase/migrations/20261119120000_purge_unconfirmed_7d.sql. Same rule (never
// confirmed by e-mail or phone, never signed in, older than the period; default 7 days), same RPC privacy_release_unconfirmed_trial
// and same audit action. The database job additionally KEEPS every account that has real data (any row referencing the user,
// uploaded files, Stripe customer, edited profile, admin-granted access) – this script does not check that, so look at its
// dry-run list before using --apply. Uses the service role server-side; prints only counts and masked e-mails, never keys,
// never user ids, never metadata.
//
//   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=... node scripts/admin/purge-unconfirmed.mjs [--days 7] [--apply]
//   (NEXT_PUBLIC_SUPABASE_URL and SR are accepted as well.)
//
// Per user with --apply: rpc privacy_release_unconfirmed_trial(uid) (frees the trial ledger row only this account created, so the
// real owner of the address still gets the 7-day trial) → DELETE /auth/v1/admin/users/<uid> → admin_audit_log
// (action unconfirmed_signup_purged). The RPC re-checks «never confirmed, never signed in» inside the database.

export const MIN_DAYS = 1;
export const MAX_DAYS = 365;

export function parseArgs(argv) {
  const out = { days: 7, apply: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--apply") out.apply = true;
    else if (a === "--days") {
      const n = Number(argv[++i]);
      if (!Number.isInteger(n) || n < MIN_DAYS || n > MAX_DAYS) throw new Error(`--days must be an integer ${MIN_DAYS}–${MAX_DAYS}`);
      out.days = n;
    } else throw new Error(`Unknown argument: ${a}`);
  }
  return out;
}

export const maskEmail = (email) => String(email ?? "").replace(/^(.)(.*)(@.*)$/, (_, a, b, c) => `${a}${"*".repeat(Math.min(b.length, 6))}${c}`);

/** Pure: is this Admin-API user a purge candidate at `now`? */
export function isCandidate(u, now, days) {
  if (!u || typeof u.id !== "string") return false;
  if (u.email_confirmed_at || u.confirmed_at || u.phone_confirmed_at || u.last_sign_in_at) return false;
  const created = Date.parse(String(u.created_at ?? ""));
  if (!Number.isFinite(created)) return false;
  return now - created > days * 24 * 3600 * 1000;
}

/** All users via the Admin API (paginated, 200 per page). */
export async function listUsers({ url, key, fetchFn = fetch }) {
  const all = [];
  for (let page = 1; page <= 500; page++) {
    const res = await fetchFn(`${url}/auth/v1/admin/users?page=${page}&per_page=200`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!res.ok) throw new Error(`Auth admin API failed (${res.status})`);
    const body = await res.json();
    const users = Array.isArray(body) ? body : body.users ?? [];
    all.push(...users);
    if (users.length < 200) break;
  }
  return all;
}

export async function run({ url, key, args, now = Date.now(), fetchFn = fetch, log = console.log }) {
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  if (/^(sb_publishable_|eyJ.*"role":"anon")/.test(key)) throw new Error("This is not a service role key");
  const users = await listUsers({ url, key, fetchFn });
  const candidates = users.filter((u) => isCandidate(u, now, args.days));
  log(`${users.length} accounts, ${candidates.length} never confirmed + never signed in and older than ${args.days} days.`);
  for (const u of candidates) log(`  ${maskEmail(u.email)} · created ${String(u.created_at).slice(0, 10)}`);
  if (!args.apply) { log(candidates.length ? "Dry run – nothing deleted. Add --apply to delete them." : "Dry run – nothing to do."); return { ok: true, candidates: candidates.length, deleted: 0, failed: 0 }; }

  const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
  let deleted = 0; let failed = 0;
  for (const u of candidates) {
    const rel = await fetchFn(`${url}/rest/v1/rpc/privacy_release_unconfirmed_trial`, { method: "POST", headers, body: JSON.stringify({ p_uid: u.id }) });
    const relOk = rel.ok && (await rel.json().catch(() => false)) === true;
    if (!relOk) { failed++; log(`  skipped ${maskEmail(u.email)} (database says not eligible or failed: ${rel.status})`); continue; }
    const del = await fetchFn(`${url}/auth/v1/admin/users/${encodeURIComponent(u.id)}`, { method: "DELETE", headers });
    if (!del.ok) { failed++; log(`  delete failed for ${maskEmail(u.email)} (${del.status})`); continue; }
    deleted++;
    await fetchFn(`${url}/rest/v1/admin_audit_log`, {
      method: "POST", headers: { ...headers, Prefer: "return=minimal" },
      body: JSON.stringify({ admin_id: null, action: "unconfirmed_signup_purged", target_user: null, details: { via: "scripts/admin/purge-unconfirmed.mjs", days: args.days, created: String(u.created_at).slice(0, 10) } }),
    }).catch(() => undefined);
  }
  log(`Deleted ${deleted}, failed/skipped ${failed}.`);
  return { ok: failed === 0, candidates: candidates.length, deleted, failed };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const url = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SR || "";
    const r = await run({ url, key, args });
    process.exitCode = r.ok ? 0 : 1;
  } catch (e) {
    console.log(`FAILED: ${e instanceof Error ? e.message : "unknown error"}`);
    process.exitCode = 1;
  }
}
