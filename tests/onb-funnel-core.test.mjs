// Pure rules of the sign-up funnel /start (components/funnel/funnel-core.ts, SPEC-FLOW §1–4).
//   node --experimental-strip-types --test tests/onb-funnel-core.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import {
  addFunnelProfession, canResume, cooldownLeft, emailError, emptyFunnelState, firstNameError, formatCountdown, goalLine, likelyBirthYears,
  loginHref, neighbours, perWeekLine, planRows, planSummaryLine, presetFromNext, progressOf, resolveStep, signupChoiceOf, stepError, stepHref,
  stepsFor, toggleProfession, weeklyGoalFeedback, isSkippable, normalizeCode, parseConfirmRecord,
} from "../components/funnel/funnel-core.ts";
import { STUDENT_STEPS, PARENT_STEPS, STAFF_STEPS } from "../lib/funnel/types.ts";
import { payloadFromState, validatePayload } from "../lib/funnel/validate.ts";

const NOW = new Date("2026-11-19T10:00:00Z");
const S = (patch = {}) => ({ ...emptyFunnelState(NOW.getTime()), ...patch });
const student = (patch = {}) => S({ role: "student", firstName: "Lena", birthYear: 2011, schoolLevel: "8. Klasse", canton: "ZH", ...patch });
const cantonName = (c) => ({ ZH: "Zürich", BE: "Bern" })[c];
const SUGG = ["Informatiker:in", "Mediamatiker:in", "Kaufmann/Kauffrau EFZ"];

test("paths match the slugs published by onb-data (SPEC-FLOW §1.1)", () => {
  assert.deepEqual(stepsFor("student"), [...STUDENT_STEPS]);
  assert.deepEqual(stepsFor("parent"), [...PARENT_STEPS]);
  assert.deepEqual(stepsFor("staff"), [...STAFF_STEPS]);
  assert.deepEqual(stepsFor("staff", "licence"), [...STAFF_STEPS]);
  assert.deepEqual(stepsFor("staff", "pilot"), ["weg", "rolle", "zugang"], "pilot/admin leave the funnel, no konto");
  assert.deepEqual(stepsFor(null), ["weg", "rolle"]);
});

test("nach=google drops weg + konto; roleLocked drops rolle", () => {
  assert.deepEqual(stepsFor("student", null, { google: true }).filter((s) => s === "weg" || s === "konto"), []);
  assert.ok(!stepsFor("student", null, { google: true, roleLocked: true }).includes("rolle"));
  assert.equal(stepsFor("student", null, { google: true, roleLocked: true })[0], "name");
});

test("progress counts every step except weg (Schüler:in 11, Elternteil 6)", () => {
  assert.deepEqual(progressOf("rolle", stepsFor("student")), { index: 1, total: 11 });
  assert.deepEqual(progressOf("konto", stepsFor("student")), { index: 11, total: 11 });
  assert.deepEqual(progressOf("konto", stepsFor("parent")), { index: 6, total: 6 });
  assert.equal(progressOf("weg", stepsFor("student")), null);
});

test("required answers produce the final German errors; optional screens never block", () => {
  assert.equal(stepError("rolle", S()).message, "Wähl aus, wer du bist.");
  assert.equal(stepError("name", S({ firstName: "  " })).message, "Gib deinen Vornamen ein.");
  assert.match(stepError("name", S({ firstName: "x".repeat(41) })).message, /Höchstens 40 Zeichen/);
  assert.equal(stepError("name", S({ firstName: "1234" })).message, "Gib deinen Vornamen mit Buchstaben ein.");
  assert.equal(stepError("jahrgang", S(), NOW).message, "Wähl dein Geburtsjahr.");
  assert.equal(stepError("schule", S()).message, "Wähl deine Klasse.");
  assert.equal(stepError("schule", student({ classCode: "AB1" })).field, "classCode");
  assert.equal(stepError("schule", student({ classCode: "ABCD12" })), null);
  assert.equal(stepError("ort", S()).message, "Wähl deinen Kanton.");
  assert.equal(stepError("kind", S({ role: "parent", parentKid: "code", inviteCode: "ABC" })).message, "Der Code hat 8 Zeichen. Prüf ihn noch einmal.");
  for (const step of ["beruf", "wochenziel", "hilfe", "dabei", "begleiten", "plan"]) assert.equal(stepError(step, S()), null, step);
  assert.deepEqual(["hilfe", "dabei", "begleiten"].filter(isSkippable), ["hilfe", "dabei", "begleiten"]);
  assert.equal(isSkippable("name"), false);
});

test("name rule = server rule: invisible characters are stripped, length counts code points", () => {
  assert.equal(firstNameError("Le​na"), null);
  assert.equal(firstNameError("​​"), "Gib deinen Vornamen ein.");
  assert.equal(firstNameError("Zoë"), null);
  assert.equal(firstNameError("😀".repeat(40) + "a").includes("zu lang"), true);
  for (const name of ["Lena", "Jean-Luc", "Zoë", "  Mia  ", "Ana María"]) {
    const v = validatePayload({ v: 1, role: "parent", firstName: name });
    assert.equal(firstNameError(name) === null, v.ok, name);
  }
});

test("resolveStep: deep links to later steps fall back to the first unanswered required step, never a 404", () => {
  assert.equal(resolveStep("plan", S()), "rolle");
  assert.equal(resolveStep("nonsense", S()), "rolle");
  assert.equal(resolveStep("weg", S()), "weg");
  assert.equal(resolveStep("ort", S({ role: "student", firstName: "Lena" }), {}, NOW), "jahrgang");
  assert.equal(resolveStep("plan", student(), {}, NOW), "plan");
  assert.equal(resolveStep("beruf", S({ role: "parent" })), "name", "slug of another path → first open required");
  assert.equal(resolveStep("beruf", S({ role: "parent", firstName: "Eva", step: "kind" })), "kind", "all answered → the saved step of this path");
  assert.equal(resolveStep("beruf", S({ role: "parent", firstName: "Eva", step: "beruf" })), "weg");
  assert.equal(resolveStep(null, S(), { google: true }), "rolle");
});

test("neighbours walk the path; staff licence ends at konto", () => {
  assert.deepEqual(neighbours("rolle", student()), { prev: "weg", next: "name" });
  assert.deepEqual(neighbours("plan", student()), { prev: "dabei", next: "konto" });
  assert.deepEqual(neighbours("zugang", S({ role: "staff", staffAccess: "licence" })), { prev: "rolle", next: "konto" });
  assert.equal(neighbours("zugang", S({ role: "staff", staffAccess: "pilot" })).next, null);
});

test("resume card only past rolle (SPEC-FLOW §4.9)", () => {
  assert.equal(canResume(null), false);
  assert.equal(canResume(S({ role: "student", step: "rolle" })), false);
  assert.equal(canResume(S({ role: "student", step: "beruf" })), true);
  assert.equal(canResume(S({ step: "beruf" })), false, "no role → nothing to resume");
});

test("SignupChoice mapping (SPEC-FLOW §2.6)", () => {
  assert.equal(signupChoiceOf({ role: "student", classCode: "ABCD" }), "school");
  assert.equal(signupChoiceOf({ role: "student", classCode: "" }), "independent");
  assert.equal(signupChoiceOf({ role: "parent", classCode: "" }), "parent");
  assert.equal(signupChoiceOf({ role: "staff", classCode: "" }), "teacher");
  assert.equal(signupChoiceOf({ role: null, classCode: "" }), null);
});

test("weekly goal feedback copy", () => {
  assert.match(weeklyGoalFeedback(3), /etwa 12 Bewerbungen/);
  assert.match(weeklyGoalFeedback(1), /guter Anfang/);
  assert.match(weeklyGoalFeedback(7), /Viel vor/);
  assert.equal(perWeekLine(1), "1 Bewerbung pro Woche");
  assert.equal(perWeekLine(3), "3 Bewerbungen pro Woche");
});

test("birth-year chips: 6 years, newest last", () => {
  assert.deepEqual(likelyBirthYears(NOW), [2009, 2010, 2011, 2012, 2013, 2014]);
});

test("professions: max 3, case-insensitive duplicates ignored, toggling removes", () => {
  let r = addFunnelProfession([], " Koch ");
  assert.deepEqual(r.list, ["Koch"]);
  r = addFunnelProfession(r.list, "koch"); assert.deepEqual(r.list, ["Koch"]);
  r = addFunnelProfession(["a", "b", "c"], "d"); assert.equal(r.full, true); assert.equal(r.list.length, 3);
  assert.deepEqual(toggleProfession(["Koch"], "Koch").list, []);
  assert.equal(addFunnelProfession([], "x".repeat(80)).list[0].length, 60);
});

test("plan: goal line rules (EFZ only for suggestions, not doubled, free text as typed)", () => {
  assert.equal(goalLine({ professions: ["Informatiker:in"], unsure: false, startYear: 2027 }, SUGG), "Informatiker:in EFZ ab 2027");
  assert.equal(goalLine({ professions: ["Informatiker:in", "Mediamatiker:in"], unsure: false, startYear: 2027 }, SUGG), "Informatiker:in EFZ, Mediamatiker:in EFZ ab 2027");
  assert.equal(goalLine({ professions: ["Kaufmann/Kauffrau EFZ"], unsure: false, startYear: null }, SUGG), "Kaufmann/Kauffrau EFZ");
  assert.equal(goalLine({ professions: ["Pferdefachmann"], unsure: false, startYear: 2028 }, SUGG), "Pferdefachmann ab 2028");
  assert.equal(goalLine({ professions: [], unsure: true, startYear: null }, SUGG), "Beruf finden, der zu dir passt");
});

test("plan rows + summary line (Panat's example)", () => {
  const s = student({ professions: ["Informatiker:in"], startYear: 2027, place: "Winterthur", help: ["lebenslauf"], family: "jetzt" });
  const rows = planRows(s, { suggestions: SUGG, cantonName });
  assert.deepEqual(rows.map((r) => r.key), ["ziel", "woche", "wo", "klasse", "hilfe", "eltern", "zugang"]);
  assert.equal(rows.find((r) => r.key === "wo").value, "Winterthur, Zürich");
  assert.equal(rows.find((r) => r.key === "zugang").value, "7 Tage gratis testen");
  assert.equal(planSummaryLine(s, SUGG), "Informatiker:in EFZ ab 2027 · 3 Bewerbungen pro Woche · 7 Tage gratis testen");
  const coded = planRows(student({ classCode: "ABCD12" }), { suggestions: SUGG, cantonName });
  assert.equal(coded.find((r) => r.key === "klasse").value.endsWith("· mit Klassencode"), true);
  assert.equal(coded.find((r) => r.key === "zugang").value, "Über deine Schule (nach dem Beitritt)");
  assert.equal(planRows(student(), { suggestions: SUGG, cantonName }).some((r) => r.key === "hilfe"), false, "row hidden when unanswered");
  assert.equal(planRows(student(), { suggestions: SUGG, cantonName }).find((r) => r.key === "wo").value, "Kanton Zürich");
  const parent = planRows(S({ role: "parent", firstName: "Eva", parentKid: "code", inviteCode: "ABCDEFGH" }), { suggestions: SUGG, cantonName });
  assert.deepEqual(parent.map((r) => r.key), ["kind", "zugang"]);
});

test("a finished funnel state builds a payload the server mirror accepts", () => {
  const s = student({ professions: ["Informatiker:in"], startYear: 2027, place: "Winterthur", help: ["lebenslauf", "brief"], classCode: "ABCD12", family: "jetzt" });
  const built = payloadFromState(s, NOW);
  assert.equal(built.ok, true);
  assert.equal("classCode" in built.payload, false, "transient answers are not sent");
  assert.equal(payloadFromState(S({ role: "parent", firstName: "Eva", help: ["fristen"] }), NOW).ok, true);
  assert.equal(payloadFromState(S({ role: "staff", staffAccess: "licence" }), NOW).ok, true);
});

test("e-mail check (no enumeration: only syntax)", () => {
  assert.equal(emailError(""), "Gib deine E-Mail-Adresse ein.");
  assert.match(emailError("lena@"), /sieht nicht richtig aus/);
  assert.equal(emailError("lena@beispiel.ch"), null);
});

test("resend cooldown 60 s + countdown text", () => {
  assert.equal(cooldownLeft(0, 0), 60);
  assert.equal(cooldownLeft(0, 18_000), 42);
  assert.equal(cooldownLeft(0, 61_000), 0);
  assert.equal(formatCountdown(42), "0:42");
  assert.equal(formatCountdown(60), "1:00");
});

test("confirm record parsing rejects junk", () => {
  assert.equal(parseConfirmRecord(null), null);
  assert.equal(parseConfirmRecord("{bad"), null);
  assert.equal(parseConfirmRecord(JSON.stringify({ email: "x", at: 1 })), null);
  assert.deepEqual(parseConfirmRecord(JSON.stringify({ email: "lena@beispiel.ch", at: 1 })), { email: "lena@beispiel.ch", at: 1 });
});

test("URLs: step hrefs keep nach=google and next; login link keeps next and stays on /login", () => {
  assert.equal(stepHref("weg"), "/start");
  assert.equal(stepHref("name"), "/start?schritt=name");
  assert.equal(stepHref("name", { google: true, next: "/familie" }), "/start?schritt=name&nach=google&next=%2Ffamilie");
  assert.equal(loginHref(null), "/login");
  assert.equal(loginHref("/classes/join/ABCD"), "/login?next=%2Fclasses%2Fjoin%2FABCD&anmelden=1");
});

test("invite presets (SPEC-FLOW §1.2)", () => {
  assert.deepEqual(presetFromNext("/classes/join/abcd12"), { role: "student", classCode: "ABCD12", inviteCode: "", familyInvite: null });
  assert.deepEqual(presetFromNext("/familie/einladung/ABCDEFGH"), { role: "parent", classCode: "", inviteCode: "ABCDEFGH", familyInvite: "parent" });
  assert.deepEqual(presetFromNext("/familie/einladung/ABCDEFGH?fuer=kind"), { role: "student", classCode: "", inviteCode: "", familyInvite: "child" });
  assert.equal(presetFromNext("/invite/xyz123").role, null);
  assert.equal(presetFromNext(null).role, null);
  assert.equal(normalizeCode("ab-cd 12"), "ABCD12");
});
