// Pure helpers in lib/b2b/licence.ts, and their sync with the SQL defaults in the b2b migration.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import {
  SCHOOL_PACKAGES, MONTHLY_SURCHARGE, defaultStudentLimit, recommendPackage, priceQuote, formatChf, licenceState, isUsableState,
  licenceError, isMissingB2bSchema, LICENCE_ERROR_MESSAGES, LICENCE_STATE_LABELS,
} from "../lib/b2b/licence.ts";

test("packages match the business plan (CHF 990 / 1'490 / 3'990; 100 / 300 / 800 students)", () => {
  assert.equal(SCHOOL_PACKAGES.starter.yearlyPriceChf, 990);
  assert.equal(SCHOOL_PACKAGES.professional.yearlyPriceChf, 1490);
  assert.equal(SCHOOL_PACKAGES.enterprise.yearlyPriceChf, 3990);
  assert.deepEqual(["pilot", "starter", "professional", "enterprise", "custom"].map(defaultStudentLimit), [60, 100, 300, 800, null]);
  assert.equal(SCHOOL_PACKAGES.custom.yearlyPriceChf, null);
});

test("SQL default limits are the same as the TS constants", async () => {
  const sql = await readFile(new URL("../supabase/migrations/20261116100000_b2b_schools_licences.sql", import.meta.url), "utf8");
  const fn = sql.slice(sql.indexOf("function public._licence_default_limit"), sql.indexOf("$$;", sql.indexOf("function public._licence_default_limit")));
  for (const [pkg, def] of Object.entries(SCHOOL_PACKAGES)) {
    if (def.studentLimit === null) assert.ok(!fn.includes(`'${pkg}' then`), pkg);
    else assert.ok(fn.includes(`'${pkg}' then ${def.studentLimit}`), `${pkg} ${def.studentLimit}`);
  }
  assert.ok(!/\b(990|1490|3990)\b/.test(sql), "prices must not be stored in SQL");
});

test("recommendPackage picks the smallest fitting package", () => {
  assert.equal(recommendPackage(0), "starter");
  assert.equal(recommendPackage(100), "starter");
  assert.equal(recommendPackage(101), "professional");
  assert.equal(recommendPackage(300), "professional");
  assert.equal(recommendPackage(799.5), "enterprise");
  assert.equal(recommendPackage(801), "custom");
});

test("priceQuote: yearly, monthly with surcharge, custom = individual offer", () => {
  assert.deepEqual(priceQuote("professional"), { yearlyChf: 1490, perPaymentChf: 1490, payments: 1, perStudentYearChf: 4.97 });
  const monthly = priceQuote("professional", "monthly");
  assert.equal(monthly.payments, 12);
  assert.equal(monthly.yearlyChf, Math.round(1490 * (1 + MONTHLY_SURCHARGE) * 20) / 20);
  assert.equal(monthly.perPaymentChf * 20 % 1, 0, "rounded to 5 Rappen");
  assert.ok(monthly.yearlyChf > 1490);
  assert.equal(priceQuote("pilot").yearlyChf, 0);
  assert.equal(priceQuote("custom"), null);
});

test("formatChf uses the Swiss thousands separator", () => {
  assert.equal(formatChf(1490), "CHF 1'490");
  assert.equal(formatChf(3990), "CHF 3'990");
  assert.equal(formatChf(990), "CHF 990");
  assert.equal(formatChf(136.6), "CHF 136.60");
  assert.equal(formatChf(1234567), "CHF 1'234'567");
});

test("licenceState mirrors public._licence_state", () => {
  const today = "2027-03-10";
  assert.equal(licenceState({ status: "pilot", pilot_end: "2027-03-10" }, today), "pilot");
  assert.equal(licenceState({ status: "pilot", pilot_end: "2027-03-09" }, today), "expired");
  assert.equal(licenceState({ status: "active", valid_from: "2027-03-11", valid_until: "2028-03-10" }, today), "not_started");
  assert.equal(licenceState({ status: "active", valid_from: "2026-03-10", valid_until: "2027-03-09" }, today), "expired");
  assert.equal(licenceState({ status: "active", valid_from: null, valid_until: null }, today), "active");
  assert.equal(licenceState({ status: "cancelled" }, today), "cancelled");
  assert.equal(licenceState({ status: "expired" }, today), "expired");
  assert.ok(isUsableState("pilot") && isUsableState("active") && !isUsableState("expired") && !isUsableState("not_started"));
});

test("licenceError recognises trigger errors by SQLSTATE or message and prefers the German detail", () => {
  assert.deepEqual(licenceError({ code: "WA001", message: "LICENCE_LIMIT_REACHED", details: "Die Schullizenz ist voll (3 von 3 Plätzen belegt)." }),
    { code: "LICENCE_LIMIT_REACHED", message: "Die Schullizenz ist voll (3 von 3 Plätzen belegt)." });
  assert.deepEqual(licenceError({ code: "P0001", message: "LICENCE_EXPIRED" }), { code: "LICENCE_EXPIRED", message: LICENCE_ERROR_MESSAGES.LICENCE_EXPIRED });
  assert.equal(licenceError({ code: "WA003", message: "x" }).code, "LICENCE_MISSING");
  assert.equal(licenceError({ code: "P0001", message: "FORBIDDEN" }), null);
  assert.equal(licenceError(null), null);
});

test("isMissingB2bSchema detects an old database so the UI can hide the feature", () => {
  assert.ok(isMissingB2bSchema({ code: "PGRST202", message: "Could not find the function public.class_goal_progress" }));
  assert.ok(isMissingB2bSchema({ code: "42P01", message: 'relation "public.class_goals" does not exist' }));
  assert.ok(isMissingB2bSchema({ message: "Could not find the table 'public.schools' in the schema cache" }));
  assert.ok(!isMissingB2bSchema({ code: "P0001", message: "FORBIDDEN" }));
  assert.ok(!isMissingB2bSchema(undefined));
});

test("German texts use Swiss spelling (no sharp s)", () => {
  const all = JSON.stringify([SCHOOL_PACKAGES, LICENCE_ERROR_MESSAGES, LICENCE_STATE_LABELS]);
  assert.ok(!all.includes("ß"));
});
