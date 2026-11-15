import assert from "node:assert/strict";
import { test } from "node:test";
import { parseRecoveryLink } from "../lib/recovery-link.ts";

test("new e-mail link with token_hash", () => {
  assert.deepEqual(parseRecoveryLink("?token_hash=pkce_abc123&type=recovery", ""), { kind: "token_hash", tokenHash: "pkce_abc123" });
  assert.deepEqual(parseRecoveryLink("token_hash=abc", ""), { kind: "token_hash", tokenHash: "abc" });
});

test("token_hash of another type is not a recovery link", () => {
  assert.deepEqual(parseRecoveryLink("?token_hash=abc&type=signup", ""), { kind: "none" });
});

test("old PKCE link with ?code=", () => {
  assert.deepEqual(parseRecoveryLink("?code=1234-5678", ""), { kind: "code" });
});

test("Supabase error in the hash (link used or expired)", () => {
  const r = parseRecoveryLink("", "#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired");
  assert.equal(r.kind, "error");
  assert.equal(r.code, "otp_expired");
  assert.match(r.description, /expired/);
});

test("error in the query wins over a code", () => {
  assert.equal(parseRecoveryLink("?error=server_error&code=1", "").kind, "error");
});

test("nothing in the URL", () => {
  assert.deepEqual(parseRecoveryLink("", ""), { kind: "none" });
});
