// Auth audit 2026-11-17: open redirect via ?next=, password policy, logout. See ../_launch/REPORT-auth.md.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { safeNextPath } from "../lib/ux.ts";
import { MIN_PASSWORD_LENGTH, newPasswordProblem } from "../lib/password-policy.ts";
import { signOutEverywhere } from "../lib/sign-out.ts";
import { loadLib } from "./helpers/load-lib.mjs";

const role = await loadLib("role");
const deletion = await loadLib("account-deletion");
const ORIGIN = "https://wendapply.ch";

// What a browser does with the path: WHATWG URL parsing strips tab/CR/LF and treats "\" like "/".
const leavesSite = (path) => new URL(path, ORIGIN).origin !== ORIGIN;

const ATTACKS = [
  "/\t/evil.com", "/\n/evil.com", "/\r/evil.com", "/\t\\evil.com", "/\\/evil.com", "/\\evil.com", "\\\\evil.com",
  "//evil.com", "///evil.com", "https://evil.com", "javascript:alert(1)", "/\u0000/evil.com", "/\u007f/evil.com",
  " /evil.com", "evil.com", "/login", "/login/reset", "/login?next=//evil.com", "/.//evil.com",
];

test("every attack string is refused by safeNextPath", () => {
  for (const bad of ATTACKS) assert.equal(safeNextPath(bad), null, JSON.stringify(bad));
  assert.equal(safeNextPath("/" + "a".repeat(3000)), null, "overlong");
});

test("the old check let tab/newline variants through, and those really leave the site", () => {
  for (const bad of ["/\t/evil.com", "/\n/evil.com", "/\r/evil.com"]) {
    const old = bad.startsWith("/") && !bad.startsWith("//") && !bad.startsWith("/\\") && !bad.startsWith("/login");
    assert.equal(old, true, "old check accepted it");
    assert.equal(leavesSite(bad), true, "browser resolves it to another origin");
  }
});

test("as the browser decodes ?next= (URLSearchParams), percent-encoded attacks are refused too", () => {
  for (const q of ["next=/%09/evil.com", "next=/%0A/evil.com", "next=/%0D/evil.com", "next=/%5C/evil.com", "next=%2F%2Fevil.com"]) {
    const next = new URLSearchParams(q).get("next");
    assert.equal(safeNextPath(next), null, q);
  }
});

test("normal in-app paths keep working", () => {
  for (const ok of ["/dashboard", "/applications/1", "/classes/join/ABC123", "/familie/einladung/X1?fuer=kind", "/search?q=Koch%20EFZ#top", "/invite/abc", "/teacher/classes/1"]) {
    assert.equal(safeNextPath(ok), ok, ok);
    assert.equal(leavesSite(ok), false);
  }
});

test("no accepted path ever resolves to another origin (fuzz over prefixes)", () => {
  const pieces = ["/", "\\", "\t", "\n", "\r", "%09", "%5c", ".", "@", "evil.com", ":", "?", "#", " "];
  let checked = 0;
  for (const a of pieces) for (const b of pieces) for (const c of pieces) {
    const s = `/${a}${b}${c}evil.com`;
    const safe = safeNextPath(s);
    if (safe !== null) assert.equal(leavesSite(safe), false, JSON.stringify(s));
    checked++;
  }
  assert.ok(checked > 2000);
});

test("login landing never forwards an attack string (landingPath / parentLandingPath / studentOnboardingHref)", () => {
  for (const bad of ATTACKS) {
    assert.equal(role.landingPath("student", bad), "/dashboard", JSON.stringify(bad));
    assert.equal(role.landingPath("teacher", bad), "/teacher", JSON.stringify(bad));
    assert.equal(role.parentLandingPath(bad), "/familie", JSON.stringify(bad));
    assert.equal(role.studentOnboardingHref(bad), "/onboarding", JSON.stringify(bad));
    assert.equal(role.rolePickerHref(bad), "/auth/role", JSON.stringify(bad));
  }
});

test("password policy: minimum 8, common and trivial passwords refused, e-mail not allowed", () => {
  assert.equal(MIN_PASSWORD_LENGTH, 8);
  assert.match(newPasswordProblem("abc123"), /mindestens 8/);
  assert.match(newPasswordProblem("1234567"), /mindestens 8/);
  for (const weak of ["12345678", "Passwort123", "PASSWORD", "qwertz123", "aaaaaaaa", "wendapply"]) assert.match(newPasswordProblem(weak), /einfach/, weak);
  assert.match(newPasswordProblem("lena.muster@schule.ch", "Lena.Muster@schule.ch"), /E-Mail/);
  assert.match(newPasswordProblem("lenamuster", "lenamuster@gmail.com"), /E-Mail/);
  assert.match(newPasswordProblem("ä".repeat(40)), /höchstens/);
  assert.equal(newPasswordProblem("Fluss-Velo-47"), null);
  assert.equal(newPasswordProblem("korrekt pferd batterie", "x@y.ch"), null);
});

test("'Passwort ändern' uses the same policy", () => {
  assert.equal(deletion.MIN_PASSWORD_LENGTH, 8);
  assert.match(deletion.passwordChangeProblem("old-pass-1", "12345678", "12345678"), /einfach/);
  assert.equal(deletion.passwordChangeProblem("oldpassword", "Fluss-Velo-47", "Fluss-Velo-47"), null);
});

test("signup and reset pages enforce the policy (no 6-character minimum left)", () => {
  for (const file of ["components/funnel/account.tsx", "app/login/reset/page.tsx"]) { // sign-up = the funnel's last screen
    const src = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    assert.match(src, /newPasswordProblem\(/, file);
    assert.doesNotMatch(src, /minLength=\{6\}|mindestens sechs|Mindestens 6/, file);
  }
});

test("logout revokes globally and drops the local session when the server call fails", async () => {
  const calls = [];
  const ok = await signOutEverywhere({ signOut: async (o) => { calls.push(o.scope); return { error: null }; } });
  assert.equal(ok, true); assert.deepEqual(calls, ["global"]);

  calls.length = 0;
  const failed = await signOutEverywhere({ signOut: async (o) => { calls.push(o.scope); return o.scope === "global" ? { error: new Error("fetch failed") } : { error: null }; } });
  assert.equal(failed, false); assert.deepEqual(calls, ["global", "local"]);

  calls.length = 0;
  const thrown = await signOutEverywhere({ signOut: async (o) => { calls.push(o.scope); if (o.scope === "global") throw new Error("offline"); } });
  assert.equal(thrown, false); assert.deepEqual(calls, ["global", "local"]);

  const shell = readFileSync(new URL("../components/layout/workspace-shell.tsx", import.meta.url), "utf8");
  assert.match(shell, /signOutEverywhere\(supabase\.auth\)/);
  assert.match(shell, /clearRoleCache\(\)/);
});
