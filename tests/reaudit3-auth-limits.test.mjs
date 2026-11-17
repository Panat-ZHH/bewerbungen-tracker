// Re-audit 3 (auth + limits), 2026-11-17. Regression tests for the fixes of this round.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";

const del = await import("../lib/account-deletion.ts");
const pw = await import("../lib/password-policy.ts");
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const NOW = 1_800_000_000_000;
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = (claims) => `${b64({ alg: "HS256" })}.${b64(claims)}.sig`;
const amr = (method, ageSeconds) => ({ method, timestamp: NOW / 1000 - ageSeconds });

const googleOnly = { identities: [{ provider: "google" }], app_metadata: { provider: "google", providers: ["google"] } };
const emailUser = { identities: [{ provider: "email" }], app_metadata: { provider: "email", providers: ["email"] } };
const both = { identities: [{ provider: "google" }, { provider: "email" }], app_metadata: { provider: "google", providers: ["google", "email"] } };

test("M1: a fresh password sign-in does NOT unlock deletion of a Google-only account (password added via updateUser)", () => {
  const token = jwt({ amr: [amr("password", 10), amr("oauth", 86400)] });
  assert.equal(del.isFreshSignIn(token, NOW), true, "the old generic check would have accepted it");
  assert.equal(del.isFreshReauth(token, googleOnly, NOW), false);
  assert.equal(del.isFreshReauth(token, null, NOW), false);
  assert.equal(del.isFreshReauth(token, { identities: [] }, NOW), false);
});

test("M1: legitimate re-authentication still works", () => {
  assert.equal(del.isFreshReauth(jwt({ amr: [amr("password", 30)] }), emailUser, NOW), true);
  assert.equal(del.isFreshReauth(jwt({ amr: [amr("password", 30)] }), both, NOW), true);
  assert.equal(del.isFreshReauth(jwt({ amr: [amr("oauth", 30)] }), googleOnly, NOW), true);
  assert.equal(del.isFreshReauth(jwt({ amr: [amr("password", 9999), amr("oauth", 30)] }), googleOnly, NOW), true);
  // e-mail link (proves the mailbox) is fine for any account
  assert.equal(del.isFreshReauth(jwt({ amr: [amr("otp", 30)] }), googleOnly, NOW), true);
  // providers only known from app_metadata (identities not returned)
  assert.equal(del.isFreshReauth(jwt({ amr: [amr("password", 30)] }), { app_metadata: { providers: ["email"] } }, NOW), true);
});

test("M1: stale or broken tokens stay refused", () => {
  assert.equal(del.isFreshReauth(jwt({ amr: [amr("password", 301)] }), emailUser, NOW), false);
  assert.equal(del.isFreshReauth(jwt({ amr: [amr("oauth", 301)] }), googleOnly, NOW), false);
  assert.equal(del.isFreshReauth(jwt({}), emailUser, NOW), false);
  assert.equal(del.isFreshReauth("garbage", emailUser, NOW), false);
  assert.equal(del.isFreshReauth(jwt({ amr: [{ method: "password" }] }), emailUser, NOW), false);
  assert.deepEqual(del.freshSignInMethods(jwt({ amr: [amr("password", 10), amr("oauth", 400), null, "x"] }), NOW), ["password"]);
});

test("M1: /api/account/delete checks the re-authentication against the VERIFIED user", () => {
  const src = read("app/api/account/delete/route.ts");
  assert.match(src, /isFreshReauth\(token, user\)/);
  assert.doesNotMatch(src, /isFreshSignIn\(/);
  // the user comes from auth.getUser(token) (server-side verification), never from the request body
  assert.match(src, /admin\.auth\.getUser\(token\)[\s\S]*const user = data\.user;[\s\S]*isFreshReauth/);
});

test("M2: Passwort ändern sends current_password so Supabase Auth can verify the old password server-side", () => {
  assert.deepEqual(pw.passwordChangeAttributes("alt-Passwort-1", "neu-Passwort-2"), { password: "neu-Passwort-2", current_password: "alt-Passwort-1" });
  assert.equal(pw.isCurrentPasswordError({ code: "current_password_mismatch" }), true);
  assert.equal(pw.isCurrentPasswordError({ code: "current_password_required" }), true);
  assert.equal(pw.isCurrentPasswordError({ code: "same_password" }), false);
  assert.equal(pw.isCurrentPasswordError(null), false);
  const card = read("components/settings/password-change.tsx");
  assert.match(card, /updateUser\(passwordChangeAttributes\(current, next\)\)/);
  assert.doesNotMatch(card, /updateUser\(\{ password: next \}\)/);
  assert.match(card, /isCurrentPasswordError\(error\)/);
});

test("M2: the reset page (recovery session, exempt on the server) still sends only the new password", () => {
  const reset = read("app/login/reset/page.tsx");
  assert.match(reset, /updateUser\(\{ password \}\)/);
  assert.doesNotMatch(reset, /current_password/);
});
