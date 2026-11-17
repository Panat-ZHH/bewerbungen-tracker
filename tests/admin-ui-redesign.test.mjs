// Admin UI redesign (2026-11-17): plain-language status / audit labels and the UI wiring that must stay security-neutral.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, existsSync } from "node:fs";

const { userStatus, auditActionLabel, subscriptionLabel, ACCESS_REASON_LABEL } = await import("../lib/admin/status.ts");
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const NOW = Date.parse("2026-11-17T12:00:00Z");
const fmt = (iso) => iso.slice(0, 10);

test("one status per person, most important first", () => {
  const s = (row) => userStatus(row, fmt, NOW).label;
  assert.equal(s({ blocked: true, free_access_forever: true, access_state: "blocked" }), "Gesperrt");
  assert.equal(s({ access_state: "blocked" }), "Gesperrt");
  assert.equal(s({ free_access_forever: true, access_state: "active", access_reason: "grant", subscription: { status: "active" } }), "Gratis unbefristet");
  assert.equal(s({ free_access_until: "2027-01-31T23:59:59Z", access_state: "active", access_reason: "grant" }), "Gratis bis 2027-01-31");
  assert.equal(s({ free_access_until: "2026-11-01T00:00:00Z", access_state: "expired" }), "Abgelaufen", "an expired grant does not count");
  assert.equal(s({ subscription: { status: "active" }, access_state: "active", access_reason: "subscription" }), "Zahlend");
  assert.equal(s({ access_state: "active", access_reason: "family_subscription" }), "Zahlend");
  assert.equal(s({ subscription: { status: "canceled" }, access_state: "trial", access_reason: "trial" }), "Trial");
  assert.equal(s({ access_state: "expired", access_reason: "none" }), "Abgelaufen");
  assert.equal(s({ access_state: "grace" }), "Zahlung offen");
  assert.equal(s({ access_state: "licence_required" }), "Lizenz fehlt");
  assert.equal(s({ access_state: "active", access_reason: "school_licence" }), "Über Schule");
  assert.equal(s({ access_state: null }), "Unbekannt");
  assert.equal(userStatus({ blocked: true }, fmt, NOW).tone, "danger");
});

test("audit codes and Stripe states are shown in words", () => {
  assert.equal(auditActionLabel("user.grant_access"), "Gratis-Zugang gegeben");
  assert.equal(auditActionLabel("user.block.failed"), "Konto gesperrt – fehlgeschlagen");
  assert.equal(auditActionLabel("school.assign_licence"), "Lizenz zugewiesen");
  assert.equal(auditActionLabel("something.new"), "something.new");
  assert.equal(subscriptionLabel("past_due"), "Zahlung offen");
  assert.equal(subscriptionLabel("weird"), "weird");
  for (const k of ["school_licence", "subscription", "family_subscription", "grant", "trial", "grace", "none"]) assert.ok(ACCESS_REASON_LABEL[k]);
});

test("redesign is UI only: every chip maps to an existing server filter, actions go through the same API with confirm: true", () => {
  const overview = read("components/admin/overview.tsx");
  for (const [chip, q] of [["trial", 'state: "trial"'], ["paying", 'sub: "active"'], ["free_forever", 'state: "grant_forever"'], ["trial_over", 'state: "trial_over"'], ["blocked", 'state: "blocked"']]) {
    assert.match(overview, new RegExp(`case "${chip}": return \\{ ${q} \\};`), chip);
  }
  const detail = read("components/admin/user-detail.tsx");
  // "Lizenz zuweisen" reuses the school action add_teacher / add_admin (same guard, audit and validation as before).
  assert.match(detail, /action: form\.school_role === "admin" \? "add_admin" : "add_teacher", email: res\.data\.email, confirm: true/);
  assert.match(detail, /const body: Record<string, unknown> = \{ action, confirm: true \};/);
  for (const a of ["grant_access", "extend_trial", "block", "unblock", "assign_school"]) assert.match(detail, new RegExp(`action="${a}"`), a);
  assert.match(detail, /<ConfirmModal/);
  // The admin client never talks to Supabase tables directly and never imports server code.
  for (const f of ["overview.tsx", "users-tab.tsx", "user-detail.tsx", "side-panel.tsx", "dashboard.tsx", "audit-tab.tsx"]) {
    const src = read(`components/admin/${f}`);
    assert.ok(!/supabase\.from\(|service_role|SUPABASE_SERVICE_ROLE_KEY|lib\/admin\/(server|handler|guard|store)/.test(src), f);
  }
  assert.ok(!existsSync(new URL("../components/admin/signups-tab.tsx", import.meta.url)), "the old 'Neu' tab is folded into the chip");
});
