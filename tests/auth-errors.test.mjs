import assert from "node:assert/strict";
import { test } from "node:test";
import { authErrorMessage, retryMinutes } from "../lib/auth-errors.ts";

test("429 gives a wait time", () => {
  assert.match(authErrorMessage({ status: 429, message: "For security purposes, you can only request this after 47 seconds." }), /in 1 Minute /);
  assert.match(authErrorMessage({ status: 429, code: "over_email_send_rate_limit", message: "email rate limit exceeded" }), /in 60 Minuten/);
  assert.equal(retryMinutes("after 5 minutes"), 5);
});
test("known errors map to concrete German", () => {
  assert.match(authErrorMessage({ code: "email_address_invalid", message: "Email address \"x\" is invalid" }), /E-Mail-Adresse/);
  assert.match(authErrorMessage({ code: "user_already_exists", message: "User already registered" }), /schon ein Konto/);
  assert.match(authErrorMessage({ code: "weak_password", message: "Password should be at least 6 characters" }), /zu schwach/);
  assert.match(authErrorMessage(new Error("Invalid login credentials")), /Passwort stimmt nicht/);
});
