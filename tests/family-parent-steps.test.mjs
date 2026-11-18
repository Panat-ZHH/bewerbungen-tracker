// Parent next-best-action on /familie (BILLING-FLOW-SPEC §3.1, AC-U3) + billing phase mapping used by the parent card (AC-U1)
// + flag-aware public copy (S7). Browser flow: scripts/family-parent-flow-e2e.mjs.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parentNextAction, openChildInvite, connectedChild, childNeedingConsent, PAID_PHASES, FIX_PHASES } from "../components/family/parent-steps.ts";
import { billingPhase, readBillingStatus } from "../components/billing/logic.ts";
import { readMyFamily } from "../lib/family-core.ts";
import { FAMILY_COPY, fill } from "../lib/family-copy.ts";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const future = new Date(Date.now() + 5 * 864e5).toISOString();
const past = new Date(Date.now() - 864e5).toISOString();
const kid = (consent, status = "active") => ({ user_id: "c1", display_name: "Lina", role: "child", status, consent_status: consent });
const fam = ({ kids = [], invites = [] } = {}) => readMyFamily({ family: { id: "f1", name: "Familie Meier" }, my_role: "parent",
  members: [{ user_id: "p1", display_name: "Sandra", role: "parent", status: "active", consent_status: "not_required" }, ...kids], plan: null, invites }, "p1");
const states = (r) => Object.fromEntries(r.steps.map((s) => [s.id, s.state]));
const ON = { initialCode: "", online: true };

test("no family: create, or accept_invite with an invite code", () => {
  const r = parentNextAction(null, "none", ON);
  assert.equal(r.current, "create");
  assert.deepEqual(states(r), { family: "current", child: "todo", plan: "todo" });
  assert.equal(parentNextAction(null, "none", { ...ON, initialCode: "ABCD1234" }).current, "accept_invite");
});

test("family, no child: invite_child, or wait_child with an open unexpired code", () => {
  assert.equal(parentNextAction(fam(), "none", ON).current, "invite_child");
  assert.deepEqual(states(parentNextAction(fam(), "none", ON)), { family: "done", child: "current", plan: "todo" });
  const open = fam({ invites: [{ code: "abcd1234", direction: "parent_invites_child", expires_at: future }] });
  assert.equal(parentNextAction(open, "none", ON).current, "wait_child");
  assert.deepEqual(openChildInvite(open), { code: "ABCD1234", expiresAt: future });
  assert.equal(parentNextAction(fam({ invites: [{ code: "ABCD1234", direction: "parent_invites_child", expires_at: past }] }), "none", ON).current, "invite_child", "expired code");
  assert.equal(parentNextAction(fam({ invites: [{ code: "ABCD1234", direction: "child_invites_parent", expires_at: future }] }), "none", ON).current, "invite_child", "wrong direction");
  assert.equal(parentNextAction(fam({ kids: [kid("not_required", "pending")] }), "none", ON).current, "invite_child", "a pending member is not connected");
});

test("child under 16 joined: consent (attention)", () => {
  for (const c of ["pending", "withdrawn"]) {
    const f = fam({ kids: [kid(c)] });
    const r = parentNextAction(f, "none", ON);
    assert.equal(r.current, "consent", c);
    assert.equal(states(r).child, "attention");
    assert.equal(childNeedingConsent(f).displayName, "Lina");
    assert.equal(connectedChild(f), null);
  }
});

test("child connected: buy / rebuy / fix_payment / done by phase", () => {
  for (const c of ["granted", "not_required"]) assert.equal(parentNextAction(fam({ kids: [kid(c)] }), "none", ON).current, "buy", c);
  const f = fam({ kids: [kid("not_required")] });
  const want = { none: "buy", incomplete: "buy", ended: "rebuy", past_due: "fix_payment", unpaid: "fix_payment", active: "done", trialing: "done", canceling: "done", paused: "done" };
  for (const [phase, action] of Object.entries(want)) assert.equal(parentNextAction(f, phase, ON).current, action, phase);
  assert.deepEqual(states(parentNextAction(f, "none", ON)), { family: "done", child: "done", plan: "current" });
  assert.deepEqual(states(parentNextAction(f, "past_due", ON)), { family: "done", child: "done", plan: "attention" });
  assert.deepEqual(states(parentNextAction(f, "active", ON)), { family: "done", child: "done", plan: "done" });
  assert.deepEqual([...PAID_PHASES].sort(), ["active", "canceling", "paused", "trialing"]);
  assert.deepEqual([...FIX_PHASES].sort(), ["past_due", "unpaid"]);
});

test("paid before the child is connected (S6): child step stays current, plan step done", () => {
  const r = parentNextAction(fam(), "active", ON);
  assert.equal(r.current, "invite_child");
  assert.deepEqual(states(r), { family: "done", child: "current", plan: "done" });
});

test("flag off: two steps, done once the child is connected", () => {
  const off = { initialCode: "", online: false };
  assert.equal(parentNextAction(null, "none", off).steps.length, 2);
  const r = parentNextAction(fam({ kids: [kid("granted")] }), "none", off);
  assert.equal(r.current, "done");
  assert.deepEqual(states(r), { family: "done", child: "done" });
});

test("billing phase mapping for the parent card (§3.5)", () => {
  const ph = (v) => billingPhase(v === null ? null : readBillingStatus(v));
  assert.equal(ph(null), "none");
  assert.equal(ph({ plan: null, status: null, source: null }), "none");
  assert.equal(ph({ status: "pilot", source: "manual" }), "trialing");
  assert.equal(ph({ status: "trial", source: "manual" }), "trialing");
  assert.equal(ph({ status: "active", source: "manual" }), "active");
  assert.equal(ph({ status: "active", source: "stripe", subscriptionStatus: "active" }), "active");
  assert.equal(ph({ status: "active", source: "stripe", subscriptionStatus: "active", cancelAtPeriodEnd: true }), "canceling");
  assert.equal(ph({ status: "active", source: "stripe", subscriptionStatus: "past_due" }), "past_due");
  assert.equal(ph({ status: "active", source: "stripe", subscriptionStatus: "unpaid" }), "unpaid");
  assert.equal(ph({ subscriptionStatus: "incomplete" }), "incomplete");
  assert.equal(ph({ subscriptionStatus: "paused", status: "paused" }), "paused");
  assert.equal(ph({ subscriptionStatus: "canceled", status: "active" }), "ended");
  assert.equal(ph({ subscriptionStatus: "incomplete_expired" }), "ended");
  assert.equal(ph({ subscriptionStatus: "canceled", status: "expired", source: "stripe" }), "ended", "AC-P13");
  assert.equal(ph({ subscriptionStatus: "active", status: "expired" }), "ended", "expired licence overrides");
});

test("readMyFamily exposes plan.state and invites", () => {
  const f = readMyFamily({ family: { id: "f1" }, my_role: "parent", members: [], plan: { plan_type: "family", status: "active", state: "expired" }, invites: [{ code: "ab-cd 1234", direction: "parent_invites_child", expires_at: future }, { foo: 1 }] });
  assert.equal(f.plan.state, "expired");
  assert.deepEqual(f.invites, [{ code: "ABCD1234", direction: "parent_invites_child", expiresAt: future }]);
  assert.deepEqual(readMyFamily({ family: { id: "f1" }, my_role: "parent" }).invites, []);
});

test("copy: placeholders, Swiss spelling, no price literals in the parent flow", () => {
  assert.equal(fill(FAMILY_COPY.step3.cta, { price: "X" }), "Familienpaket buchen · X");
  assert.equal(fill(FAMILY_COPY.step1.done, { name: "Meine Familie" }), "Familie «Meine Familie» erstellt");
  assert.equal(fill(FAMILY_COPY.stepper.progress, { n: 2, total: 3 }), "Schritt 2 von 3");
  const forbidden = /bald verfügbar|Zugang anfragen|Warteliste|noch nicht freigeschaltet|Online-Bezahlung folgt/i;
  for (const [k, v] of Object.entries(FAMILY_COPY).flatMap(([g, o]) => Object.entries(o).map(([k2, v2]) => [`${g}.${k2}`, v2]))) {
    assert.ok(!v.includes("ß"), k);
    assert.doesNotMatch(v, forbidden, k);
  }
  for (const f of ["components/family/parent-start.tsx", "components/family/parent-view.tsx", "components/family/family-stepper.tsx", "components/family/parent-steps.ts", "components/billing/billing-card.tsx"]) {
    const s = read(f);
    assert.ok(!s.includes("ß"), f);
    assert.doesNotMatch(s, /CHF\s?\d/, f);
  }
});

test("single primary action markers exist for every parent step", () => {
  const start = read("components/family/parent-start.tsx");
  assert.match(start, /<Button type="submit" loading=\{busy\} data-primary-action="">\{FAMILY_COPY\.step1\.cta\}/, "step 1: Familie erstellen");
  assert.match(start, /submitLabel=\{FAMILY_COPY\.invite\.cta\} primary \/>/, "invite context: Einladung annehmen");
  assert.match(start, /submitLabel=\{FAMILY_COPY\.step1\.joinCta\} primary=\{false\}/, "collapsed join is secondary");
  const view = read("components/family/parent-view.tsx");
  assert.match(view, /<InvitePanel direction="parent_invites_child" initialInvite=\{invite\} onCreated=\{setLocalInvite\} primary=\{!expiredCta && !requestPrimary\} hideTitle \/>/, "step 2: code");
  assert.match(view, /\{\.\.\.\(expiredCta \|\| requestPrimary \? \{\} : \{ "data-primary-action": "" \}\)\}>\{FAMILY_COPY\.consent\.cta\}/, "step 2: consent");
  assert.match(view, /variant="secondary" onClick=\{\(\) => setConfirm\(\{ kind: "grant", child: k \}\)\}/, "list consent button is secondary");
  assert.match(view, /data-family-expired[\s\S]*data-primary-action="">\{FAMILY_COPY\.parent\.expiredCta\}/, "trial over: Familienpaket wählen");
});

test("/familien: flag-aware family status and CTAs (S7)", () => {
  const page = read("app/familien/page.tsx");
  assert.match(page, /const FAMILY_BUY_HREF = buyHref\("family", "year"\)/);
  assert.match(page, /const FAMILY_STATUS = online \? "online buchbar" : FAMILY\.status;/);
  assert.doesNotMatch(page, /\{FAMILY\.status\}/, "the sticker never shows the raw 'bald verfügbar' when on");
  assert.match(page, /\{!online && \(\s*<Section id="warteliste"/, "waitlist section hidden when on");
  assert.equal((page.match(/online\s*\?\s*<ButtonLink href=\{FAMILY_BUY_HREF\}/g) ?? []).length, 2, "hero + card CTA");
});
