import { readFileSync } from "node:fs";
import { homedir } from "node:os";
const { chromium } = await import(homedir() + "/Projects/bewerbungen-tracker-wt/audit-tools/node_modules/playwright-core/index.mjs");
// Usage: node scripts/reset-e2e.mjs <base-url>  (creates and deletes a throwaway user, sends no e-mail)
const REF = "bhwreehwirrloxagyypi", SB = `https://${REF}.supabase.co`, BASE = process.argv[2];
const tok = readFileSync(homedir() + "/.config/alfred/supabase.env", "utf8").split("\n").filter((l) => l.startsWith("SUPABASE_TOKEN_PRIVAT=")).pop().split("=").slice(1).join("=").replace(/["'\s]/g, "");
const keys = await (await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${tok}` } })).json();
const service = keys.find((k) => k.name === "service_role")?.api_key, anon = keys.find((k) => k.name === "anon")?.api_key;
const admin = (path, init = {}) => fetch(`${SB}/auth/v1/admin/${path}`, { ...init, headers: { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" } }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }));
let failed = 0; const check = (ok, name, info = "") => { if (!ok) failed++; console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : " — " + info}`); };
const email = `alfred-reset-e2e-${Date.now()}@example.com`;
const created = await admin("users", { method: "POST", body: JSON.stringify({ email, password: "Old-pass-" + Math.random(), email_confirm: true }) });
const uid = created.body.id; check(!!uid, "throwaway test user created", created.status);
const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
try {
  const link = await admin("generate_link", { method: "POST", body: JSON.stringify({ type: "recovery", email, redirect_to: `${BASE}/login/reset` }) });
  const hash = link.body.hashed_token ?? link.body.properties?.hashed_token; check(!!hash, "recovery token generated (no e-mail sent)", link.status);
  const url = `${BASE}/login/reset?token_hash=${hash}&type=recovery`;
  const scan = await fetch(url); check(scan.status === 200, "mail-scanner style GET of the link does not fail", scan.status);
  // fresh browser = "other device": no PKCE verifier in storage
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0 Mobile/15E148 Safari/604.1" });
  const page = await ctx.newPage(); await page.goto(url);
  await page.waitForSelector("#new-password", { timeout: 15000 }).then(() => check(true, "other device: password form shown (no 'expired')"), (e) => check(false, "other device: password form shown", (e.message || "").slice(0, 80)));
  check(!page.url().includes("token_hash"), "token removed from the address bar");
  const newPw = "New-pass-" + Date.now();
  await page.fill("#new-password", newPw); await page.fill("#new-password-2", newPw); await page.click("button[type=submit]");
  await page.waitForURL(/\/(dashboard|onboarding|welcome|start)/, { timeout: 20000 }).then(() => check(true, "after saving: redirected into the app", page.url()), () => check(false, "redirect after saving", page.url()));
  await page.screenshot({ path: "/tmp/reset-e2e-after-save.png" });
  const login = await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: anon, "Content-Type": "application/json" }, body: JSON.stringify({ email, password: newPw }) });
  check(login.status === 200, "login with the new password works", login.status);
  const ctx2 = await browser.newContext(); const p2 = await ctx2.newPage(); await p2.goto(url);
  await p2.fill("#new-password", "x-reuse-123"); await p2.fill("#new-password-2", "x-reuse-123"); await p2.click("button[type=submit]");
  await p2.getByText(/abgelaufen oder wurde schon benutzt/).waitFor({ timeout: 15000 }).then(() => check(true, "reusing the link: clear 'expired/used' message"), () => check(false, "reuse message"));
  const p3 = await ctx2.newPage(); await p3.goto(`${BASE}/login/reset#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired`);
  await p3.getByText(/abgelaufen oder wurde schon benutzt/).waitFor({ timeout: 15000 }).then(() => check(true, "#error_code=otp_expired shows the expired message"), () => check(false, "otp_expired message"));
  const p4 = await ctx2.newPage(); await p4.goto(`${BASE}/login/reset?code=00000000-0000-0000-0000-000000000000`);
  await p4.getByText(/nur im Browser, in dem du ihn angefordert hast/).waitFor({ timeout: 15000 }).then(() => check(true, "old ?code= link in another browser: explains why"), () => check(false, "other-browser message"));
} finally {
  await browser.close();
  if (uid) { const del = await admin(`users/${uid}`, { method: "DELETE" }); check(del.status === 200, "throwaway user deleted", del.status); }
}
console.log(failed ? `${failed} FAILED` : "ALL PASSED"); process.exit(failed ? 1 : 0);
