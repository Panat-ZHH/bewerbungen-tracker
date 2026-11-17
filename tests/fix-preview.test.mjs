// Fixes for the preview end-to-end run (_launch/PREVIEW-E2E.md, bugs B1-B4).
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { shouldPollRequests } from "../lib/friend-badge.ts";

const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("B3: friend-request badge never polls social_list without a session", () => {
  assert.equal(shouldPollRequests(true, false), false);
  assert.equal(shouldPollRequests(false, true), false);
  assert.equal(shouldPollRequests(false, false), false);
  assert.equal(shouldPollRequests(true, true), true);
  const ctx = src("components/friends/friend-requests-context.tsx");
  assert.match(ctx, /supabase\.auth\.getSession\(\)/);
  assert.match(ctx, /onAuthStateChange/);
  assert.match(ctx, /const active = shouldPollRequests\(enabled, signedIn\)/);
  // both the start/route fetch and the 30 s poll are gated by the session, not only by `enabled`
  assert.equal((ctx.match(/if \(!active\) return;/g) ?? []).length, 2);
  assert.doesNotMatch(ctx, /\}, \[enabled, pathname, refresh\]\)/);
});
