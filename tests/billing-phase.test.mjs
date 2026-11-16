// BILLING-FLOW-SPEC §3.5 / §6 (AC-U1, AC-U2, AC-U4, AC-U5, AC-U6): billing phases, badges, flag-aware texts, the shared
// family copy, the student-side helpers in lib/family-core.ts, portal return URL and the "open subscription" query.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  billingPhase, hasSubscription, billingStatusLabel, phaseBadge, phaseText, readBillingStatus, billingErrorMessage, isPortalReturn,
  stripBillingParams, FAMILY_RETURN_MESSAGE, BILLING_PHASES, BUYABLE_PHASES, SUBSCRIBED_PHASES, ATTENTION_PHASES,
} from "../components/billing/logic.ts";
import { FAMILY_COPY, fill } from "../lib/family-copy.ts";
import {
  readMyFamily, readInvites, openInvite, isEmptyOwnFamily, planSummary, planGivesAccess, childPlanLine, inviteLink, readInviteAudience,
  familyInviteCodeFromPath, loginNextFor, signupPreset, isAlreadyInFamily, isBirthYearRequired, familyError,
} from "../lib/family-core.ts";
import { portal, portalReturnUrl } from "../lib/billing/api.ts";
import { supabaseApiDb, OPEN_SUBSCRIPTION_STATUSES } from "../lib/billing/server.ts";

const read = (p) => readFile(new URL(`../${p}`, import.meta.url), "utf8");
const st = (o) => readBillingStatus({ enabled: true, ...o });

test("AC-U1 billingPhase: every row of §3.5", () => {
  const rows = [
    [null, "none"],
    [st({}), "none"],
    [st({ source: "pilot", status: "pilot" }), "trialing"],
    [st({ source: "manual", status: "trial" }), "trialing"],
    [st({ source: "manual", status: "active" }), "active"],
    [st({ source: "manual", status: "expired" }), "ended"],
    [st({ source: "stripe", subscriptionStatus: "active" }), "active"],
    [st({ source: "stripe", subscriptionStatus: "active", cancelAtPeriodEnd: true }), "canceling"],
    [st({ source: "stripe", subscriptionStatus: "trialing" }), "trialing"],
    [st({ source: "stripe", subscriptionStatus: "trialing", cancelAtPeriodEnd: true }), "canceling"],
    [st({ source: "stripe", subscriptionStatus: "past_due", status: "active" }), "past_due"],
    [st({ source: "stripe", subscriptionStatus: "unpaid" }), "unpaid"],
    [st({ source: "stripe", subscriptionStatus: "incomplete" }), "incomplete"],
    [st({ source: "stripe", subscriptionStatus: "paused" }), "paused"],
    [st({ source: "stripe", subscriptionStatus: "canceled" }), "ended"],
    [st({ source: "stripe", subscriptionStatus: "incomplete_expired" }), "ended"],
    // licence state `expired` overrides whatever Stripe says
    [st({ source: "stripe", subscriptionStatus: "canceled", status: "expired" }), "ended"],
    [st({ source: "stripe", subscriptionStatus: "active", status: "expired" }), "ended"],
    [st({ source: "stripe", subscriptionStatus: "something_new" }), "none"],
  ];
  for (const [input, phase] of rows) assert.equal(billingPhase(input), phase, JSON.stringify(input));
  // every phase is in exactly one of buyable / subscribed
  for (const p of BILLING_PHASES) assert.equal(BUYABLE_PHASES.includes(p) !== SUBSCRIBED_PHASES.includes(p), true, p);
  assert.deepEqual([...ATTENTION_PHASES], ["past_due", "unpaid"]);
});

test("AC-U2 hasSubscription: false for ended (re-buy possible), true while a subscription still exists", () => {
  assert.equal(hasSubscription(st({ source: "stripe", subscriptionStatus: "canceled", status: "expired" })), false);
  assert.equal(hasSubscription(st({ source: "stripe", subscriptionStatus: "incomplete_expired" })), false);
  assert.equal(hasSubscription(st({ source: "stripe", status: "expired" })), false);
  assert.equal(hasSubscription(null), false);
  assert.equal(hasSubscription(st({ source: "pilot", status: "pilot" })), false, "a pilot licence is not a subscription");
  for (const s of ["active", "trialing", "past_due", "unpaid", "paused"]) assert.equal(hasSubscription(st({ source: "stripe", subscriptionStatus: s })), true, s);
  assert.equal(hasSubscription(st({ source: "stripe", subscriptionStatus: "active", cancelAtPeriodEnd: true })), true, "canceling = renew in the portal");
});

test("badges and texts follow §4.3", () => {
  const expected = { none: "", incomplete: "Zahlung ausstehend", trialing: "Testphase", active: "Aktiv", canceling: "Gekündigt", past_due: "Zahlung offen", unpaid: "Unbezahlt", paused: "Pausiert", ended: "Abgelaufen" };
  for (const [phase, label] of Object.entries(expected)) assert.equal(phaseBadge(phase).label, label, phase);
  assert.equal(phaseBadge("unpaid").tone, "danger");
  assert.equal(phaseBadge("past_due").tone, "warning");
  assert.equal(phaseBadge("active").tone, "success");
  assert.match(phaseText("canceling", "31.12.2026"), /läuft noch bis 31\.12\.2026/);
  assert.match(phaseText("active", "01.01.2027"), /Verlängert sich am 01\.01\.2027/);
  assert.doesNotMatch(phaseText("active", ""), /\{date\}/);
  assert.match(phaseText("past_due", ""), /aktualisiere deine Karte/);
  assert.equal(phaseText("none", "x"), "");
  assert.deepEqual(billingStatusLabel(st({ source: "stripe", subscriptionStatus: "past_due" })), { label: "Zahlung offen", tone: "warning" });
  assert.deepEqual(billingStatusLabel(st({ source: "pilot", status: "pilot" })), { label: "Pilot", tone: "info" });
  assert.deepEqual(billingStatusLabel(null), { label: "Kein Abo", tone: "neutral" });
  assert.equal(FAMILY_RETURN_MESSAGE.slow.title, FAMILY_COPY.return.slowTitle);
  assert.match(FAMILY_RETURN_MESSAGE.cancel.text, /nichts belastet/);
});

test("flag on: the 503 text never says 'freigeschaltet' (S7); flag off keeps the honest text", () => {
  assert.equal(billingErrorMessage(503, "billing_disabled", true), FAMILY_COPY.api.unreachable);
  assert.doesNotMatch(billingErrorMessage(503, "billing_failed", true), /freigeschaltet|bald verfügbar/i);
  assert.match(billingErrorMessage(503, "billing_disabled", false), /noch nicht freigeschaltet/);
  assert.match(billingErrorMessage(503, "price_not_found", true), /Kontaktseite/);
});

test("portal return: ?billing=portal is recognised and stripped", () => {
  assert.equal(isPortalReturn("?billing=portal"), true);
  assert.equal(isPortalReturn("?billing=success"), false);
  assert.equal(stripBillingParams("?billing=portal&plan=family"), "?plan=family");
});

test("FAMILY_COPY: every §4 group, Swiss spelling, no price literals, fill()", () => {
  for (const group of ["page", "stepper", "step1", "invite", "step2", "consent", "step3", "return", "phase", "cta", "manage", "banner", "status", "badge", "api", "child", "parent", "join", "switch", "seat", "wrongType"])
    assert.ok(FAMILY_COPY[group], group);
  const all = JSON.stringify(FAMILY_COPY);
  assert.equal(all.includes("ß"), false);
  assert.doesNotMatch(all, /CHF\s*\d/);
  assert.doesNotMatch(all, /bald verfügbar|Zugang anfragen|Warteliste|noch nicht freigeschaltet/i);
  assert.equal(fill(FAMILY_COPY.stepper.progress, { n: 2, total: 3 }), "Schritt 2 von 3");
  assert.equal(fill(FAMILY_COPY.step3.cta, {}), "Familienpaket buchen · ");
  assert.equal(FAMILY_COPY.child.tourLink, "Eltern verbinden (freiwillig)");
});

test("AC-U4 readMyFamily exposes plan.state and the open invites; planSummary is flag-aware", () => {
  const f = readMyFamily({
    family: { id: "f1", name: "" }, my_role: "child",
    members: [{ user_id: "k1", role: "child", status: "active", consent_status: "not_required" }],
    plan: { plan_type: "family", status: "active", state: "expired", seats_parents: 1, seats_children: 1 },
    invites: [{ code: "abcd1234", direction: "child_invites_parent", expires_at: "2026-11-23T10:00:00Z" }, { code: "bad" }, "x"],
  });
  assert.equal(f.plan.state, "expired");
  assert.deepEqual(f.invites, [{ code: "ABCD1234", direction: "child_invites_parent", expiresAt: "2026-11-23T10:00:00Z" }]);
  assert.deepEqual(openInvite(f, "child_invites_parent"), f.invites[0]);
  assert.equal(openInvite(f, "parent_invites_child"), null);
  assert.equal(openInvite(null, "child_invites_parent"), null);
  assert.deepEqual(readInvites(null), []);
  assert.deepEqual(readMyFamily({ family: { id: "f2" } }).invites, []);
  // an ended plan is never "Aktiv"
  assert.equal(planSummary(f.plan).status, "Abgelaufen");
  assert.equal(planSummary({ ...f.plan, state: "active" }).status, "Aktiv");
  // no plan: "Bald verfügbar" only while online payment is off
  assert.doesNotMatch(JSON.stringify(planSummary(null, new Date(), { online: true })), /bald verfügbar|freigeschaltet/i);
  assert.match(planSummary(null).status, /Bald verfügbar/);
});

test("S8 child plan line: neutral, never payment details", () => {
  const plan = (state) => ({ planType: "family", status: "active", state, seatsParents: 1, seatsChildren: 1, trialEndsAt: null });
  for (const s of ["active", "trial", "pilot"]) assert.deepEqual(childPlanLine(plan(s)), { active: true, badge: "Aktiv", text: FAMILY_COPY.child.planActive }, s);
  for (const p of [null, plan("expired"), plan("paused"), plan("past_due")]) {
    const line = childPlanLine(p);
    assert.equal(line.badge, null);
    assert.equal(line.text, FAMILY_COPY.child.planNone);
    assert.doesNotMatch(line.text, /Zahlung|Karte|überfällig|bald verfügbar/i);
  }
  assert.equal(planGivesAccess({ ...plan(null), status: "trial" }), true, "falls back to the raw status");
});

test("invite links carry ?fuer=, login keeps query + hash, signup role preselect (P5–P7)", () => {
  assert.equal(inviteLink("https://a.ch/", "abcd1234", "child_invites_parent"), "https://a.ch/familie/einladung/ABCD1234?fuer=eltern");
  assert.equal(inviteLink("https://a.ch", "abcd1234", "parent_invites_child"), "https://a.ch/familie/einladung/ABCD1234?fuer=kind");
  assert.equal(inviteLink("https://a.ch", "abcd1234"), "https://a.ch/familie/einladung/ABCD1234", "old two-argument form unchanged");
  assert.equal(readInviteAudience("/familie/einladung/ABCD1234?fuer=kind#x"), "kind");
  assert.equal(readInviteAudience("?fuer=eltern"), "eltern");
  assert.equal(readInviteAudience("/familie"), null);
  assert.equal(familyInviteCodeFromPath("/familie/einladung/abcd-1234"), "ABCD1234");
  assert.equal(familyInviteCodeFromPath("/familie"), null);
  assert.equal(familyInviteCodeFromPath("/familie/einladung/xy"), null);
  assert.equal(loginNextFor("/familie", "?plan=family&interval=month", "#abo"), "/familie?plan=family&interval=month#abo");
  assert.equal(loginNextFor("/dashboard", "?x=1"), null);
  assert.equal(loginNextFor(null), null);
  assert.deepEqual(signupPreset("/familie/einladung/ABCD1234?fuer=eltern"), { choice: "parent", hint: "parent" });
  assert.deepEqual(signupPreset("/familie/einladung/ABCD1234"), { choice: "parent", hint: "parent" });
  assert.deepEqual(signupPreset("/familie/einladung/ABCD1234?fuer=kind"), { choice: "independent", hint: "child" });
  assert.deepEqual(signupPreset("/familie?plan=family&interval=year#abo"), { choice: "parent", hint: null });
  assert.equal(signupPreset("/familien"), null, "the public marketing page is not the family area");
  assert.equal(signupPreset("/dashboard"), null);
  assert.equal(signupPreset(null), null);
});

test("S9 empty-family switch + error detection", () => {
  const fam = (members, plan = null) => readMyFamily({ family: { id: "f" }, my_role: "child", members, plan });
  const me = { user_id: "me", role: "child", status: "active" };
  assert.equal(isEmptyOwnFamily(fam([me]), "me"), true);
  assert.equal(isEmptyOwnFamily(fam([me]), null), true);
  assert.equal(isEmptyOwnFamily(fam([me, { user_id: "p", role: "parent", status: "active" }]), "me"), false);
  assert.equal(isEmptyOwnFamily(fam([me], { plan_type: "family", status: "active" }), "me"), false, "never dissolve a family with a plan");
  assert.equal(isEmptyOwnFamily(null), false);
  assert.equal(isAlreadyInFamily({ message: "ALREADY_IN_FAMILY" }), true);
  assert.equal(isAlreadyInFamily({ message: "INVITE_USED" }), false);
  assert.equal(isBirthYearRequired({ message: "BIRTH_YEAR_REQUIRED", details: "Bitte gib zuerst dein Geburtsjahr an." }), true);
  assert.match(familyError({ message: "BIRTH_YEAR_REQUIRED" }), /Jahrgang/);
});

test("AC-U5 portal returns to /familie?billing=portal; a canceling subscription blocks a second checkout", async () => {
  assert.equal(portalReturnUrl("https://w.test", { kind: "family", id: "f" }), "https://w.test/familie?billing=portal");
  assert.equal(portalReturnUrl("https://w.test", { kind: "school", id: "s" }), "https://w.test/schul-admin");
  const calls = [];
  const FAMILY = "00000000-0000-4000-8000-000000003002";
  const deps = {
    enabled: true, configured: true, liveMode: false, baseUrl: "https://w.test",
    auth: { async getUser() { return { id: "u", email: "p@x.ch" }; }, async isSchoolAdmin() { return false; }, async isFamilyParent() { return true; } },
    stripe: { async createPortalSession(p) { calls.push(p); return { url: "https://portal.test" }; } },
    db: { async findCustomerId() { return "cus_1"; } },
  };
  assert.equal((await portal({ token: "t", body: { familyId: FAMILY } }, deps)).status, 200);
  assert.equal(calls[0].returnUrl, "https://w.test/familie?billing=portal");

  // The real query: no `cancel_at_period_end = false` filter any more, and unpaid/paused count as open.
  const seen = [];
  const rows = [{ id: "sub_canceling", status: "active", cancel_at_period_end: true }];
  const chain = {
    select() { return chain; },
    eq(col, val) { seen.push(["eq", col, val]); return chain; },
    in(col, vals) { seen.push(["in", col, vals]); return chain; },
    limit() { return Promise.resolve({ data: rows.filter((r) => OPEN_SUBSCRIPTION_STATUSES.includes(r.status)), error: null }); },
  };
  const db = supabaseApiDb({ from(table) { seen.push(["from", table]); return chain; } });
  assert.equal(await db.hasOpenSubscription({ kind: "family", id: FAMILY }), true);
  assert.equal(seen.some(([op, col]) => op === "eq" && col === "cancel_at_period_end"), false, "canceling rows count (P14)");
  assert.deepEqual(OPEN_SUBSCRIPTION_STATUSES, ["active", "trialing", "past_due", "unpaid", "paused"]);
});

test("AC-U6 Part B component files: no sharp s, no CHF literals, no flag-off wording outside flag-off branches", async () => {
  const files = ["components/family/student-start.tsx", "components/family/child-view.tsx", "components/family/invite-panel.tsx", "components/billing/billing-banner.tsx", "lib/family-copy.ts"];
  for (const f of files) {
    const src = await read(f);
    assert.equal(src.includes("ß"), false, `${f}: Swiss spelling`);
    assert.doesNotMatch(src, /CHF\s*\d/, `${f}: prices only from lib/billing/plans.ts`);
  }
  for (const f of ["components/family/student-start.tsx", "components/family/invite-panel.tsx", "components/billing/billing-banner.tsx"])
    assert.doesNotMatch(await read(f), /bald verfügbar|Zugang anfragen|Warteliste|freigeschaltet/i, f);
  // The student never calls the billing API (S8 / AC-S5)
  for (const f of ["components/family/student-start.tsx", "components/family/child-view.tsx"]) assert.doesNotMatch(await read(f), /fetchBillingStatus|\/api\/billing|FamilyBilling/, f);
  const tour = await read("components/onboarding/student-onboarding.tsx");
  assert.match(tour, /TOUR_FAMILY_LINK/);
  assert.match(tour, /TOUR_FAMILY_PATH/);
});
