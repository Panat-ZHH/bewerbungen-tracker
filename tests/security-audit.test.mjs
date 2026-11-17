// Security audit 2026-11-17 (REPORT-security.md): regression tests for every fix of the audit. No network.
// The live RLS checks with real anon / user tokens are in tests/rls-live.test.mjs (opt-in via env).
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile, readdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { contentSecurityPolicy, securityHeaders, supabaseOrigin } from "../lib/security-headers.ts";
import { safeHttpUrl } from "../lib/safe-url.ts";
import { setupTeacherDb } from "./helpers/teacher-db.mjs";

const root = new URL("../", import.meta.url);
const read = (p) => readFile(new URL(p, root), "utf8");
const directive = (csp, name) => csp.split("; ").find((d) => d === name || d.startsWith(`${name} `))?.split(" ").slice(1) ?? null;

test("headers: CSP, HSTS, framing, sniffing, referrer and permissions policy on every route", async () => {
  const h = Object.fromEntries(securityHeaders({ supabaseUrl: "https://bhwreehwirrloxagyypi.supabase.co" }).map((x) => [x.key, x.value]));
  assert.match(h["Strict-Transport-Security"], /max-age=\d{8,}/);
  assert.equal(h["X-Frame-Options"], "DENY");
  assert.equal(h["X-Content-Type-Options"], "nosniff");
  assert.equal(h["Referrer-Policy"], "strict-origin-when-cross-origin");
  assert.match(h["Permissions-Policy"], /camera=\(\)/);
  assert.match(h["Permissions-Policy"], /payment=\(self "https:\/\/js\.stripe\.com"\)/);
  const csp = h["Content-Security-Policy"];
  assert.deepEqual(directive(csp, "frame-ancestors"), ["'none'"]);
  assert.deepEqual(directive(csp, "object-src"), ["'none'"]);
  assert.deepEqual(directive(csp, "base-uri"), ["'self'"]);
  assert.ok(directive(csp, "script-src").includes("https://js.stripe.com"), "Stripe.js allowed");
  assert.ok(!directive(csp, "script-src").includes("'unsafe-eval'"), "no eval in production");
  for (const host of ["https://js.stripe.com", "https://hooks.stripe.com", "https://checkout.stripe.com"]) assert.ok(directive(csp, "frame-src").includes(host), host);
  const connect = directive(csp, "connect-src");
  for (const host of ["'self'", "https://bhwreehwirrloxagyypi.supabase.co", "wss://bhwreehwirrloxagyypi.supabase.co", "https://api.stripe.com"]) assert.ok(connect.includes(host), host);
  assert.ok(!connect.includes("*") && !connect.includes("https:"), "no open connect-src");
  assert.ok(directive(csp, "img-src").includes("https://bhwreehwirrloxagyypi.supabase.co"), "avatars from Supabase storage");
  assert.ok(csp.includes("upgrade-insecure-requests"));
  assert.ok(contentSecurityPolicy({ dev: true }).includes("'unsafe-eval'"), "dev keeps React debugging");
  assert.equal(supabaseOrigin(undefined), "https://*.supabase.co");
  assert.equal(supabaseOrigin("https://abc.supabase.co/rest/v1"), "https://abc.supabase.co");
});

test("next.config.ts wires the headers for all paths and hides x-powered-by", async () => {
  const cfg = await read("next.config.ts");
  assert.match(cfg, /securityHeaders\(/);
  assert.match(cfg, /source:\s*"\/:path\*"/);
  assert.match(cfg, /poweredByHeader:\s*false/);
});

test("deps: next is patched (GHSA-2464-fhr4-w9xw / GHSA-vcvr-r3jv-pc5j RCE, fixed in 16.4.5)", async () => {
  const { version } = JSON.parse(await read("node_modules/next/package.json"));
  const [maj, min, pat] = version.split(/[.-]/).map(Number);
  assert.ok(maj > 16 || (maj === 16 && (min > 4 || (min === 4 && pat >= 5))), `next ${version}`);
  assert.match(JSON.parse(await read("package.json")).dependencies.next, /16\.(4\.([5-9]|\d\d)|([5-9]|\d\d)\.)/);
});

test("safeHttpUrl: only http(s) links from user data", () => {
  assert.equal(safeHttpUrl("https://jobs.ch/x?a=1"), "https://jobs.ch/x?a=1");
  assert.equal(safeHttpUrl(" http://e.ch "), "http://e.ch/");
  for (const bad of ["javascript:alert(1)", "JaVaScRiPt:alert(1)", " javascript:alert(1)", "data:text/html,<script>alert(1)</script>", "vbscript:x", "//evil.com", "jobs.ch", "", null, 42, "https://" + "a".repeat(3000)]) {
    assert.equal(safeHttpUrl(bad), null, String(bad).slice(0, 40));
  }
});

test("application detail page renders the job link only through safeHttpUrl", async () => {
  const page = await read("app/applications/[id]/page.tsx");
  assert.ok(!/href=\{application\.jobUrl\}/.test(page));
  assert.match(page, /href=\{safeHttpUrl\(application\.jobUrl\)!\}/);
});

test("API routes: no wildcard CORS, every state-changing route is authenticated by a header (CSRF-safe)", async () => {
  const routes = execFileSync("git", ["ls-files", "app/**/route.ts", "app/*/route.ts"], { cwd: root, encoding: "utf8" }).split("\n").filter(Boolean);
  assert.ok(routes.length >= 10);
  for (const r of routes) {
    const src = await read(r);
    assert.ok(!/Access-Control-Allow-Origin/i.test(src), `${r} sets CORS`);
    if (!/export async function (POST|PUT|PATCH|DELETE)/.test(src)) continue;
    // Bearer token (never cookies: a cross-site form cannot set Authorization), the Stripe signature, or the cron secret.
    assert.ok(/authorization|stripe-signature/i.test(src), `${r} has a state-changing handler without header auth`);
    assert.ok(!/cookies\(\)/.test(src), `${r} authenticates with cookies`);
  }
});

test("service role key is only used server-side", async () => {
  const files = execFileSync("git", ["grep", "-l", "SUPABASE_SERVICE_ROLE_KEY", "--", "app", "components", "lib"], { cwd: root, encoding: "utf8" }).split("\n").filter(Boolean);
  for (const f of files) {
    const src = await read(f);
    assert.ok(!/^["']use client["']/m.test(src), `${f} is a client component`);
    assert.ok(f.startsWith("app/api/") || f.startsWith("lib/billing/server") || f === "lib/reminders-server.ts" || f === "lib/account-delete-server.ts" || f === "lib/rate-limit/index.ts", `${f} is not a server-only module`);
  }
  // The service-role rate limiter must only be reachable from route handlers, never from client code.
  const importers = execFileSync("git", ["grep", "-lE", "from [\"']@/lib/(rate-limit|api-rate-limit)[\"'/]", "--", "app", "components", "lib"], { cwd: root, encoding: "utf8" }).split("\n").filter(Boolean);
  for (const f of importers) {
    assert.ok(f.startsWith("app/api/") || f.startsWith("lib/"), `${f} imports the service-role rate limiter`);
    assert.ok(!/^["']use client["']/m.test(await read(f)), `${f} is a client module importing the rate limiter`);
  }
  assert.ok(!/NEXT_PUBLIC_[A-Z_]*SERVICE/.test(execFileSync("git", ["grep", "-h", "NEXT_PUBLIC_", "--", "app", "components", "lib", ".env.example"], { cwd: root, encoding: "utf8" })));
});

test("no secrets in tracked files (Stripe, Supabase, Anthropic, webhook secrets, service-role JWTs)", () => {
  const pattern = "(sk|rk)_(live|test)_[A-Za-z0-9]{20,}|whsec_[A-Za-z0-9]{20,}|sbp_[a-f0-9]{30,}|sb_secret_[A-Za-z0-9_-]{20,}|sk-ant-[A-Za-z0-9_-]{20,}|oak_live_[A-Za-z0-9]{10,}|eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\\.[A-Za-z0-9_-]{40,}";
  let hits = "";
  try { hits = execFileSync("git", ["grep", "-nIE", pattern, "--", ".", ":!package-lock.json"], { cwd: root, encoding: "utf8" }); } catch (e) { if (e.status !== 1) throw e; }
  assert.equal(hits.replace(/[:=]\S{6}\S*/g, ":…"), "", "secret-looking values are committed");
  const env = execFileSync("git", ["ls-files", "*.env", ".env*", "**/.env*"], { cwd: root, encoding: "utf8" }).split("\n").filter(Boolean);
  assert.deepEqual(env, [".env.example"]);
});

test("ICS feed escapes ';' and ',' (RFC 5545), so a company name cannot break the calendar entry", async () => {
  const src = await read("lib/reminders.ts");
  assert.ok(src.includes('.replace(/;/g, "\\\\;")'));
});

test("SQL: AI review daily limit survives deleting reviews; usage log is invisible to users", async () => {
  const ctx = await setupTeacherDb({ seed: false });
  const U = "00000000-0000-4000-8000-00000000a1a1", V = "00000000-0000-4000-8000-00000000b2b2";
  await ctx.admin("insert into auth.users (id, email) values ($1, 'u@example.com'), ($2, 'v@example.com')", [U, V]);
  const review = (u) => ctx.admin("insert into public.ai_reviews (user_id, score, result, model, prompt_version) values ($1, 50, '{}', 'mock', 'v1')", [u]);
  await review(U); await review(U); await review(V);
  const usage = async (u) => Number((await ctx.admin("select count(*) n from public.ai_review_usage where user_id = $1 and created_at > now() - interval '24 hours'", [u]))[0].n);
  assert.equal(await usage(U), 2);
  // U deletes all own reviews (allowed, privacy) – the limit counter must stay.
  await ctx.as(U);
  await ctx.rpc("delete from public.ai_reviews");
  await ctx.admin("select 1");
  assert.equal(Number((await ctx.admin("select count(*) n from public.ai_reviews where user_id = $1", [U]))[0].n), 0, "own reviews deleted");
  assert.equal(await usage(U), 2, "deleting reviews reset the AI limit");
  assert.equal(await usage(V), 1);
  // Users cannot see, write or wipe the log.
  for (const sql of ["select * from public.ai_review_usage", `insert into public.ai_review_usage (user_id) values ('${U}')`, "delete from public.ai_review_usage", "select public._ai_review_log_usage()"]) {
    await ctx.as(U);
    assert.ok(await ctx.code(ctx.rpc(sql)), `user could run: ${sql}`);
  }
  await ctx.asAnon();
  assert.ok(await ctx.code(ctx.rpc("select * from public.ai_review_usage")), "anon reads usage");
  assert.ok(await ctx.code(ctx.rpc("select * from public.reminder_log")), "reminder_log grant still open");
  // Account deletion cascades.
  await ctx.admin("delete from auth.users where id = $1", [U]);
  assert.equal(await usage(U), 0);
  // Idempotent.
  const f = (await readdir(new URL("supabase/migrations/", root))).find((x) => x.includes("security_ai_usage_log"));
  await ctx.apply(f);
});

test("edge function: daily limit uses the persistent rate_limit_hit counter, never the deletable ai_reviews rows", async () => {
  // Integration note: audit-sec counted ai_review_usage; audit-ai replaced the count with rate_limit_hit
  // (ai-review:user:<id>:day). Both are independent of ai_reviews deletes; the trigger log stays as audit trail.
  const src = await read("supabase/functions/ai-review/index.ts");
  assert.match(src, /rpc\("rate_limit_hit"/);
  assert.doesNotMatch(src, /countReviewsSince/);
  assert.doesNotMatch(src, /from\("ai_reviews"\)\.select\("id", \{ count/);
});
