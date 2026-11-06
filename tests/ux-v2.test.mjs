import assert from "node:assert/strict";
import { test } from "node:test";
import { authMessage, deadlineInfo, friendlyMessage, oauthErrorMessage, passwordHint, safeNextPath } from "../lib/ux.ts";

test("friendlyMessage never leaks raw database text", () => {
  const msg = friendlyMessage(new Error("Database error: XX000 | secret"), "Die Bewerbung konnte nicht gespeichert werden.");
  assert.match(msg, /^Die Bewerbung konnte nicht gespeichert werden\. Versuch es/);
  assert.doesNotMatch(msg, /XX000|secret/);
});

test("friendlyMessage maps known causes", () => {
  assert.match(friendlyMessage(new Error("Failed to fetch"), "x"), /Keine Verbindung/);
  assert.match(friendlyMessage({ code: "42501", message: "row-level security" }, "x"), /Berechtigung/);
  assert.match(friendlyMessage({ status: 401, message: "JWT expired" }, "x"), /abgelaufen/);
  assert.match(friendlyMessage({ status: 503, message: "" }, "x"), /Server/);
});

test("authMessage is German and specific", () => {
  assert.match(authMessage(new Error("Invalid login credentials")), /E-Mail oder Passwort/);
  assert.match(authMessage(new Error("User already registered")), /schon ein Konto/);
  assert.match(authMessage(new Error("???")), /Das hat nicht geklappt/);
});

test("passwordHint levels", () => {
  assert.equal(passwordHint("").level, 0);
  assert.equal(passwordHint("abc").level, 1);
  assert.equal(passwordHint("abcdefgh1").level, 2);
  assert.equal(passwordHint("Abcdefgh12!x").level, 3);
});

test("deadlineInfo wording and tone", () => {
  const today = new Date(2026, 10, 5);
  assert.deepEqual(deadlineInfo("2026-11-05", today), { days: 0, label: "heute", tone: "danger" });
  assert.equal(deadlineInfo("2026-11-06", today).label, "morgen");
  assert.equal(deadlineInfo("2026-11-04", today).label, "gestern abgelaufen");
  assert.equal(deadlineInfo("2026-11-01", today).label, "vor 4 Tagen abgelaufen");
  assert.equal(deadlineInfo("2026-11-10", today).tone, "warning");
  assert.equal(deadlineInfo("2026-12-25", today).tone, "neutral");
  assert.equal(deadlineInfo("kaputt", today), null);
});

test("safeNextPath only allows same-site paths", () => {
  assert.equal(safeNextPath("/applications/1"), "/applications/1");
  for (const bad of ["//evil.com", "/\\evil", "https://evil.com", "/login", null, undefined, ""]) assert.equal(safeNextPath(bad), null);
});

test("oauthErrorMessage maps Supabase/Google return errors to German", () => {
  assert.equal(oauthErrorMessage(""), null);
  assert.equal(oauthErrorMessage("?code=abc&next=%2Fdashboard"), null);
  assert.match(oauthErrorMessage("?error=access_denied&error_description=User+denied"), /abgebrochen/);
  assert.match(oauthErrorMessage("#error=server_error&error_code=signup_disabled&error_description=Signups+not+allowed"), /Neue Konten/);
  assert.match(oauthErrorMessage("error=server_error&error_code=identity_already_exists"), /bereits mit einem anderen Konto/);
  assert.match(oauthErrorMessage("error=invalid_request&error_description=bad_oauth_state"), /abgelaufen/);
  assert.match(oauthErrorMessage(new URLSearchParams("error=weird")), /Google hat nicht geklappt/);
});
