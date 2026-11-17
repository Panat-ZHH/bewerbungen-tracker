#!/usr/bin/env node
// Adds (or removes) a WendApply PLATFORM ADMIN by login e-mail (public.platform_admins, docs/access/GO-LIVE.md).
// Uses the service role server-side; prints only success / failure, never keys, never the full e-mail, never user ids.
//
//   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=... node scripts/admin/add-admin.mjs <email> [--note "..."]
//   ... node scripts/admin/add-admin.mjs <email> --remove
//   (NEXT_PUBLIC_SUPABASE_URL and SR are accepted as well, e.g. after `source ~/.config/alfred/tmp/wendapply-sr.env`.)
//
// The admin must still enrol TOTP MFA in /admin (aal2) before any admin API works (SPEC §5).
// Every change is written to public.admin_audit_log (action platform_admin_added / platform_admin_removed).

export function parseArgs(argv) {
  const out = { email: null, note: null, remove: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--remove") out.remove = true;
    else if (a === "--note") out.note = argv[++i] ?? null;
    else if (!a.startsWith("--") && !out.email) out.email = a.trim().toLowerCase();
    else throw new Error(`Unknown argument: ${a}`);
  }
  if (!out.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.email) || out.email.length > 254) throw new Error("Usage: add-admin.mjs <email> [--note text] [--remove]");
  if (out.note && out.note.length > 500) throw new Error("Note too long (max 500)");
  return out;
}

export const maskEmail = (email) => email.replace(/^(.)(.*)(@.*)$/, (_, a, b, c) => `${a}${"*".repeat(Math.min(b.length, 6))}${c}`);

/** Finds the auth user id for an e-mail (Admin API, paginated). */
export async function findUserId({ url, key, email, fetchFn = fetch }) {
  for (let page = 1; page <= 200; page++) {
    const res = await fetchFn(`${url}/auth/v1/admin/users?page=${page}&per_page=200`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!res.ok) throw new Error(`Auth admin API failed (${res.status})`);
    const body = await res.json();
    const users = Array.isArray(body) ? body : body.users ?? [];
    const hit = users.find((u) => String(u.email ?? "").toLowerCase() === email);
    if (hit) return hit.id;
    if (users.length < 200) return null;
  }
  return null;
}

export async function run({ url, key, args, fetchFn = fetch }) {
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  if (/^(sb_publishable_|eyJ.*"role":"anon")/.test(key)) throw new Error("This is not a service role key");
  const userId = await findUserId({ url, key, email: args.email, fetchFn });
  if (!userId) return { ok: false, message: `No WendApply account with ${maskEmail(args.email)}.` };
  const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
  const rest = `${url}/rest/v1`;
  let res;
  if (args.remove) {
    res = await fetchFn(`${rest}/platform_admins?user_id=eq.${userId}`, { method: "DELETE", headers: { ...headers, Prefer: "return=minimal" } });
  } else {
    res = await fetchFn(`${rest}/platform_admins?on_conflict=user_id`, {
      method: "POST", headers: { ...headers, Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ user_id: userId, note: args.note ?? "added by scripts/admin/add-admin.mjs" }),
    });
  }
  if (!res.ok) return { ok: false, message: `Database refused the change (${res.status}). Is migration 20261118010000_access_core.sql applied?` };
  const audit = await fetchFn(`${rest}/admin_audit_log`, {
    method: "POST", headers: { ...headers, Prefer: "return=minimal" },
    body: JSON.stringify({ admin_id: null, action: args.remove ? "platform_admin_removed" : "platform_admin_added", target_user: userId, details: { via: "scripts/admin/add-admin.mjs", note: args.note ?? null } }),
  });
  if (!audit.ok) return { ok: false, message: `Changed, but the audit log entry failed (${audit.status}).` };
  return { ok: true, message: args.remove ? `${maskEmail(args.email)} is no longer a platform admin.` : `${maskEmail(args.email)} is now a platform admin (MFA enrolment in /admin still needed).` };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const url = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SR || "";
    const r = await run({ url, key, args });
    console.log(r.ok ? `OK: ${r.message}` : `FAILED: ${r.message}`);
    process.exitCode = r.ok ? 0 : 1;
  } catch (e) {
    console.log(`FAILED: ${e instanceof Error ? e.message : "unknown error"}`);
    process.exitCode = 1;
  }
}
