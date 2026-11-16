import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { PLANS, BILLING, STRIPE_PLANS, isStripeEnabled, isStripeEnabledClient, planByLookupKey, formatChf, planIntervals, lookupKeyFor, planPrice, yearlySavingChf } from "../lib/billing/plans.ts";
import { SCHOOL_PACKAGES, PILOT_DAYS, formatChf as licenceFormatChf, priceQuote } from "../lib/b2b/licence.ts";
import { PACKAGES, PILOT, FAMILY } from "../components/public/marketing.ts";

test("catalogue: business plan prices and limits", () => {
  const pick = (id) => [PLANS[id].priceChfPerYear, PLANS[id].studentLimit];
  assert.deepEqual(pick("starter"), [990, 100]);
  assert.deepEqual(pick("professional"), [1490, 300]);
  assert.deepEqual(pick("enterprise"), [3990, 800]);
  assert.deepEqual(pick("individual"), [null, null]);
  assert.deepEqual(pick("pilot"), [0, 60]);
  assert.equal(PLANS.pilot.pilotDays, 30);
  assert.equal(PLANS.pilot.maxClasses, 2);
  for (const [id, p] of Object.entries(PLANS)) assert.equal(p.id, id);
});

test("family plan: 1 parent + 1 child, card only, CHF 7.90/month or CHF 79/year, no VAT (decided 2026-11-16)", () => {
  const f = PLANS.family;
  assert.equal(f.kind, "family");
  assert.deepEqual(f.seats, { parents: 1, children: 1 });
  assert.equal(f.priceChfPerYear, 79);
  assert.equal(f.priceChfPerMonth, 7.9);
  assert.equal(f.placeholder, undefined, "no placeholder any more");
  assert.equal("vatIncluded" in f, false, "no VAT: WendApply is not MWST-registered");
  assert.equal(f.checkout, true);
  assert.equal(f.invoiceAllowed, false);
  assert.deepEqual(planIntervals(f), ["year", "month"]);
  assert.deepEqual(planIntervals(PLANS.starter), ["year"]);
  assert.equal(planPrice(f, "month"), 7.9);
  assert.equal(planPrice(f, "year"), 79);
  assert.equal(yearlySavingChf(f), 15.8);
  assert.equal(formatChf(f.priceChfPerMonth), "CHF 7.90");
  assert.equal(formatChf(yearlySavingChf(f)), "CHF 15.80");
  assert.doesNotMatch(readFileSync(new URL("../lib/billing/plans.ts", import.meta.url), "utf8"), /PLACEHOLDER/);
  // the public site follows the catalogue
  assert.equal(FAMILY.pricePerYear, 79);
  assert.equal(FAMILY.pricePerMonth, 7.9);
});

test("lookup keys match the contract and are unique", () => {
  assert.deepEqual(STRIPE_PLANS.map((p) => p.lookupKey), [
    "wendapply_starter_yearly_chf", "wendapply_professional_yearly_chf", "wendapply_enterprise_yearly_chf", "wendapply_family_yearly_chf",
  ]);
  for (const id of ["pilot", "individual"]) {
    assert.equal(PLANS[id].lookupKey, null);
    assert.equal(PLANS[id].checkout, false);
    assert.equal(PLANS[id].invoiceAllowed, false);
  }
  for (const id of ["starter", "professional", "enterprise"]) assert.ok(PLANS[id].checkout && PLANS[id].invoiceAllowed, id);
  assert.equal(planByLookupKey("wendapply_professional_yearly_chf")?.id, "professional");
  assert.equal(planByLookupKey("wendapply_family_yearly_chf")?.id, "family");
  assert.equal(planByLookupKey("wendapply_family_monthly_chf")?.id, "family");
  assert.equal(lookupKeyFor(PLANS.family, "month"), "wendapply_family_monthly_chf");
  assert.equal(lookupKeyFor(PLANS.family, "year"), "wendapply_family_yearly_chf");
  assert.equal(lookupKeyFor(PLANS.starter, "month"), null);
  const all = STRIPE_PLANS.flatMap((p) => planIntervals(p).map((i) => lookupKeyFor(p, i)));
  assert.equal(new Set(all).size, all.length, "all lookup keys unique");
  for (const k of all) assert.match(k, /^wendapply_[a-z]+_(yearly|monthly)_chf$/);
  assert.equal(planByLookupKey("nope"), undefined);
  assert.equal(planByLookupKey(""), undefined);
});

test("BILLING defaults: CHF, no VAT (not registered), yearly only, 30 days to pay", () => {
  assert.deepEqual({ ...BILLING }, { currency: "chf", vatRegistered: false, monthlySurchargePct: 0, invoiceDaysUntilDue: 30 });
});

test("feature flags default OFF and only 'true' switches them on", () => {
  const keep = { s: process.env.STRIPE_ENABLED, c: process.env.NEXT_PUBLIC_STRIPE_ENABLED };
  try {
    delete process.env.STRIPE_ENABLED; delete process.env.NEXT_PUBLIC_STRIPE_ENABLED;
    assert.equal(isStripeEnabled(), false);
    assert.equal(isStripeEnabledClient(), false);
    process.env.STRIPE_ENABLED = "1"; process.env.NEXT_PUBLIC_STRIPE_ENABLED = "yes";
    assert.equal(isStripeEnabled(), false);
    assert.equal(isStripeEnabledClient(), false);
    process.env.STRIPE_ENABLED = "true"; process.env.NEXT_PUBLIC_STRIPE_ENABLED = "true";
    assert.equal(isStripeEnabled(), true);
    assert.equal(isStripeEnabledClient(), true);
  } finally {
    for (const [k, v] of [["STRIPE_ENABLED", keep.s], ["NEXT_PUBLIC_STRIPE_ENABLED", keep.c]]) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});

test("formatChf: Swiss apostrophe, same as licence.formatChf", () => {
  assert.equal(formatChf(1490), "CHF 1'490");
  assert.equal(formatChf(990), "CHF 990");
  assert.equal(formatChf(1234567), "CHF 1'234'567");
  assert.equal(formatChf(136.6), "CHF 136.60");
  assert.equal(formatChf(0), "CHF 0");
  assert.equal(licenceFormatChf(3990), formatChf(3990));
});

test("single source of truth: licence.ts and marketing.ts read from PLANS", () => {
  for (const id of ["pilot", "starter", "professional", "enterprise"]) {
    assert.equal(SCHOOL_PACKAGES[id].yearlyPriceChf, PLANS[id].priceChfPerYear, id);
    assert.equal(SCHOOL_PACKAGES[id].studentLimit, PLANS[id].studentLimit, id);
  }
  assert.equal(SCHOOL_PACKAGES.custom.yearlyPriceChf, PLANS.individual.priceChfPerYear);
  assert.equal(PILOT_DAYS, PLANS.pilot.pilotDays);
  assert.equal(PILOT.days, PLANS.pilot.pilotDays);
  for (const p of PACKAGES) {
    assert.equal(p.pricePerYear, PLANS[p.id].priceChfPerYear, p.id);
    assert.equal(p.maxStudents, PLANS[p.id].studentLimit, p.id);
  }
  assert.equal(priceQuote("starter").yearlyChf, PLANS.starter.priceChfPerYear);
  // no hard-coded school prices left outside plans.ts
  for (const f of ["../lib/b2b/licence.ts", "../components/public/marketing.ts"]) {
    const src = readFileSync(new URL(f, import.meta.url), "utf8");
    assert.doesNotMatch(src, /yearlyPriceChf:\s*\d|pricePerYear:\s*\d/, f);
  }
});

test("setup script refuses --live without STRIPE_ALLOW_LIVE=yes (no network call)", () => {
  const env = { ...process.env, STRIPE_ALLOW_LIVE: "", STRIPE_SECRET_KEY: "", STRIPE_CLI: "/nonexistent/stripe" };
  const r = spawnSync(process.execPath, [new URL("../scripts/stripe/setup-products.mjs", import.meta.url).pathname, "--live"], { env, encoding: "utf8" });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /Refusing to run against LIVE mode/);
});

test("setup script never prints secrets and is test mode by default", () => {
  const src = readFileSync(new URL("../scripts/stripe/setup-products.mjs", import.meta.url), "utf8");
  assert.match(src, /process\.env\.STRIPE_ALLOW_LIVE !== "yes"/);
  assert.match(src, /transfer_lookup_key/);
  assert.match(src, /mode: "at_period_end"/);
  assert.doesNotMatch(src, /console\.(log|error)\([^)]*\bKEY\b/);
  assert.doesNotMatch(src, /(sk|rk)_(test|live)_[A-Za-z0-9]{8,}/);
});
