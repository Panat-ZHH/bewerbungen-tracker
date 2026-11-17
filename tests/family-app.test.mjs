// Unit + source-contract tests for the family app part (parent dashboard, child side, registration choice, plan card).
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { test } from "node:test";
import {
  isMissingFamilyFeature, birthYearOptions, isValidBirthYear, mayNeedParentalConsent, choiceToAccount, signupMetadata, pendingAccountType,
  isParentMeta, parentGuardRedirect, normalizeInviteCode, isValidInviteCode, formatInviteCode, inviteLink, inviteShareText, readInvite,
  readShare, readMyFamily, childrenOf, parentsOf, seatUsage, sharingActive, nextShare, consentNotice, readChildOverview, groupStatusCounts,
  planSummary, daysLeft, formatDateCh, familyError, waitlistProblem, DEFAULT_SHARE, SHARE_LABELS, memberName, statusText, CONSENT_LABEL, readMember,
} from "../lib/family-core.ts";
import { loadLib } from "./helpers/load-lib.mjs";

const NOW = new Date("2026-11-16T10:00:00Z");
const read = (p) => readFile(new URL(`../${p}`, import.meta.url), "utf8");

test("isMissingFamilyFeature: only undeployed RPCs/tables, not real errors", () => {
  for (const e of [{ code: "PGRST202", message: "Could not find the function public.family_get_my" }, { code: "42883" }, { status: 404 }, { message: "relation \"public.families\" does not exist" }])
    assert.equal(isMissingFamilyFeature(e), true, JSON.stringify(e));
  for (const e of [null, "x", { code: "P0001", message: "SEATS_FULL" }, { code: "42501", message: "permission denied" }])
    assert.equal(isMissingFamilyFeature(e), false, JSON.stringify(e));
});

test("birth year: options, validation, conservative consent age (year only)", () => {
  const opts = birthYearOptions(NOW);
  assert.equal(opts[0], 2016); assert.equal(opts.length, 16); assert.equal(opts.at(-1), 2001);
  assert.equal(isValidBirthYear(2011, NOW), true);
  assert.equal(isValidBirthYear("abc", NOW), false);
  assert.equal(isValidBirthYear(2025, NOW), false);
  assert.equal(isValidBirthYear(1900, NOW), false);
  assert.equal(mayNeedParentalConsent(2012, NOW), true); // 13/14
  assert.equal(mayNeedParentalConsent(2010, NOW), true); // 15 or 16: may still be 15
  assert.equal(mayNeedParentalConsent(2009, NOW), false); // 16 or 17
  assert.equal(mayNeedParentalConsent(null, NOW), false);
});

test("signup choice maps onto the role model; school students keep today's metadata", () => {
  assert.deepEqual(choiceToAccount("school"), { role: "student", accountType: null });
  assert.deepEqual(choiceToAccount("teacher"), { role: "teacher", accountType: null });
  assert.deepEqual(choiceToAccount("parent"), { role: "student", accountType: "parent" });
  assert.deepEqual(choiceToAccount("independent"), { role: "student", accountType: "independent_student" });
  assert.deepEqual(signupMetadata("school", 2011), { role: "student" });
  assert.deepEqual(signupMetadata("teacher", null), { role: "teacher" });
  assert.deepEqual(signupMetadata("parent", 1980), { role: "student", account_type: "parent" }); // no birth year stored for parents
  assert.deepEqual(signupMetadata("independent", 2011), { role: "student", account_type: "independent_student", birth_year: 2011 });
});

test("pendingAccountType: only unsynced private types", () => {
  assert.equal(pendingAccountType(null), null);
  assert.equal(pendingAccountType({ role: "student" }), null);
  assert.equal(pendingAccountType({ account_type: "school_student" }), null);
  assert.equal(pendingAccountType({ account_type: "parent", account_type_synced: true }), null);
  assert.deepEqual(pendingAccountType({ account_type: "parent", birth_year: 1980 }), { type: "parent", birthYear: null });
  assert.deepEqual(pendingAccountType({ account_type: "independent_student", birth_year: 2011 }), { type: "independent_student", birthYear: 2011 });
  assert.equal(isParentMeta({ account_type: "parent" }), true);
  assert.equal(isParentMeta({ role: "student" }), false);
});

test("parents are kept out of the job-search pages, not out of settings/profile/family", () => {
  for (const p of ["/dashboard", "/applications/new", "/map", "/classes", "/friends?x=1", "/onboarding"]) assert.equal(parentGuardRedirect(p), "/familie", p);
  for (const p of ["/familie", "/familie/einladung/ABCD1234", "/settings", "/profile", "/kontakt"]) assert.equal(parentGuardRedirect(p), null, p);
});

test("invite codes: normalise, validate, format, link, share text", () => {
  assert.equal(normalizeInviteCode(" abcd-12 34 "), "ABCD1234");
  assert.equal(isValidInviteCode("abcd 1234"), true);
  assert.equal(isValidInviteCode("ABC123"), false);
  assert.equal(formatInviteCode("abcd1234"), "ABCD 1234");
  assert.equal(inviteLink("https://wendapply.ch/", "abcd 1234"), "https://wendapply.ch/familie/einladung/ABCD1234");
  assert.match(inviteShareText("parent_invites_child", "ABCD1234", "https://x/familie/einladung/ABCD1234"), /ABCD 1234.*https:\/\/x\/familie\/einladung\/ABCD1234/);
  assert.deepEqual(readInvite({ code: "abcd1234", expires_at: "2026-11-23T10:00:00Z" }), { code: "ABCD1234", expiresAt: "2026-11-23T10:00:00Z" });
  assert.deepEqual(readInvite([{ code: "WXYZ9876" }]), { code: "WXYZ9876", expiresAt: null });
  assert.equal(readInvite(null), null);
});

const FAMILY = {
  family: { id: "f1", name: "Familie Meier", created_by: "p1" }, my_role: "parent",
  members: [
    { user_id: "p1", display_name: "Sandra Meier", role: "parent", status: "active", consent_status: "not_required" },
    { user_id: "c1", display_name: "Lina Meier", role: "child", status: "active", consent_status: "pending" },
    { user_id: "c2", display_name: "Alt", role: "child", status: "removed", consent_status: "granted" },
  ],
  plan: { plan_type: "family", status: "trial", seats_parents: 1, seats_children: 1, trial_ends_at: "2026-11-30T23:00:00Z" },
};

test("readMyFamily normalises family_get_my and drops removed members", () => {
  assert.equal(readMyFamily(null), null);
  assert.equal(readMyFamily({}), null);
  const f = readMyFamily(FAMILY, "p1");
  assert.equal(f.id, "f1"); assert.equal(f.name, "Familie Meier"); assert.equal(f.myRole, "parent");
  assert.deepEqual(childrenOf(f).map((m) => m.userId), ["c1"]);
  assert.deepEqual(parentsOf(f).map((m) => m.displayName), ["Sandra Meier"]);
  assert.equal(f.plan.seatsChildren, 1); assert.equal(f.plan.status, "trial");
  assert.equal(f.myShare, null);
  const wrapped = readMyFamily([{ ...FAMILY, my_role: "child" }], "c1");
  assert.equal(wrapped.myRole, "child");
  assert.deepEqual(wrapped.myShare, DEFAULT_SHARE);
  const s = seatUsage(f);
  assert.deepEqual(s.children, { used: 1, limit: 1, full: true });
  assert.deepEqual(s.parents, { used: 1, limit: 1, full: true });
  const noPlan = readMyFamily({ ...FAMILY, plan: null, members: [FAMILY.members[0]] }, "p1");
  assert.equal(noPlan.plan, null);
  assert.equal(seatUsage(noPlan).children.full, false);
});

test("sharing: consent rules, toggle keeps unknown keys, plain-language notices", () => {
  assert.equal(sharingActive({ status: "active", consentStatus: "pending" }), false);
  assert.equal(sharingActive({ status: "active", consentStatus: "withdrawn" }), false);
  assert.equal(sharingActive({ status: "pending", consentStatus: "granted" }), false);
  assert.equal(sharingActive({ status: "active", consentStatus: "granted" }), true);
  assert.equal(sharingActive({ status: "active", consentStatus: "not_required" }), true);
  assert.deepEqual(readShare({ progress: false, applications: "yes" }), { ...DEFAULT_SHARE, progress: false });
  assert.deepEqual(nextShare({ ...DEFAULT_SHARE, documents: true }, "applications", true), { progress: true, applications: true, village: true, documents: true });
  assert.deepEqual(SHARE_LABELS.map((s) => s.key), ["progress", "applications", "village"]);
  assert.match(consentNotice("pending").text, /unter 16/);
  assert.equal(consentNotice("granted"), null);
  assert.equal(consentNotice("not_required"), null);
});

test("readChildOverview only reports what was shared", () => {
  const o = readChildOverview({ child: { display_name: "Lina" }, consent_status: "granted", progress: { total: 5, status_counts: { applied: 3, interview: 1, offer: 1, weird: 0 }, last_activity: "2026-11-15" }, village: { level: 3, items: 7, points: 420 } });
  assert.equal(o.displayName, "Lina");
  assert.equal(o.progress.total, 5); assert.equal(o.progress.placed, true);
  assert.deepEqual(o.progress.statusCounts, { applied: 3, interview: 1, offer: 1 });
  assert.deepEqual(o.village, { level: 3, items: 7, points: 420 });
  // payload shape exactly as family_child_overview returns it
  const live = readChildOverview({ child: { user_id: "c", display_name: "Lina" }, consent_status: "granted", sharing_active: true, shared: { progress: true, applications: false, village: true, documents: false }, progress: { applications_total: 4, status_counts: { applied: 4 }, placed: false, last_activity: null }, village: { islands: 2, items: 5, points_earned: 90 } });
  assert.equal(live.progress.total, 4);
  assert.deepEqual(live.village, { level: 2, items: 5, points: 90 });
  assert.equal(live.shared.applications, false);
  assert.equal(o.applications, null);
  assert.deepEqual(o.shared, { progress: true, applications: false, village: true });
  const hidden = readChildOverview({ display_name: "Lina", progress: null, village: null });
  assert.equal(hidden.progress, null); assert.equal(hidden.village, null);
  const apps = readChildOverview({ applications: [{ company: "Swisscom", position: "ICT", status: "applied", notes: "geheim" }] });
  assert.deepEqual(apps.applications, [{ company: "Swisscom", position: "ICT", status: "applied", updatedAt: null }]);
  assert.equal(JSON.stringify(apps).includes("geheim"), false);
  const counted = readChildOverview({ progress: { status_counts: { applied: 2, saved: 1 } } });
  assert.equal(counted.progress.total, 3);
  assert.equal(readChildOverview(null), null);
});

test("groupStatusCounts groups statuses for parents", () => {
  const g = groupStatusCounts({ saved: 1, preparing: 1, applied: 3, interview: 1, schnupper_done: 1, offer: 1, rejected: 2, mystery: 1 });
  assert.deepEqual(Object.fromEntries(g.map((x) => [x.key, x.count])), { open: 2, applied: 3, talks: 2, offer: 1, rejected: 2, other: 1 });
});

test("parent view labels follow lib/status.ts and never show e-mail prefixes (eltern-04/16/18)", () => {
  const g = groupStatusCounts({ schnupper_planned: 1, aptitude_test: 1, contract_signed: 1, withdrawn: 1 });
  assert.deepEqual(g.map((x) => x.label), ["Gemerkt / In Vorbereitung", "Abgeschickt", "Gespräch / Schnupperlehre", "Zusage", "Absage erhalten"]);
  assert.ok(!g.some((x) => x.key === "other"), "new statuses are grouped, not 'Andere'");
  assert.equal(statusText("applied"), "Abgeschickt"); assert.equal(statusText("rejected"), "Absage erhalten");
  assert.equal(memberName("sandra.meier77", "parent"), "Elternteil");
  assert.equal(memberName("probe-ux-eltern-paidkid-123", "child"), "Dein Kind");
  assert.equal(memberName("", "child"), "Dein Kind");
  assert.equal(memberName("Anna-Lena", "child"), "Anna-Lena");
  assert.equal(readMember({ user_id: "u1", role: "child", display_name: "lina_2009" }).displayName, "Dein Kind");
  assert.equal(CONSENT_LABEL.not_required, "Verbunden");
});

test("plan summary: trial days, seats, no plan = bald verfügbar", () => {
  assert.equal(daysLeft("2026-11-30T10:00:00Z", NOW), 14);
  assert.equal(daysLeft("2026-11-01", NOW), 0);
  assert.equal(daysLeft(null, NOW), null);
  assert.equal(formatDateCh("2026-11-23T10:00:00Z"), "23.11.2026");
  assert.deepEqual(planSummary(null, NOW).status, "Bald verfügbar");
  const trial = planSummary({ planType: "family", status: "trial", seatsParents: 1, seatsChildren: 1, trialEndsAt: "2026-11-30T10:00:00Z" }, NOW);
  // No 30-day family trial any more: the old trial row just means "not booked yet" (per-user 7-day trial instead).
  assert.equal(trial.status, "Noch nicht gebucht");
  assert.equal(trial.detail, "1 Elternteil, 1 Kind · CHF 7.90 pro Monat oder CHF 79 pro Jahr");
  assert.equal(planSummary({ planType: "family", status: "active", seatsParents: 2, seatsChildren: 3, trialEndsAt: null }, NOW).detail, "2 Elternteile, 3 Kinder");
});

test("familyError maps server codes to German (Swiss spelling) messages", () => {
  assert.match(familyError({ message: "SEATS_FULL" }), /schon ein Kind verbunden.*Kontaktseite/);
  assert.match(familyError({ message: "INVITE_EXPIRED" }), /abgelaufen/);
  assert.match(familyError({ message: "INVITE_ALREADY_USED" }), /schon verwendet/);
  assert.match(familyError({ message: "INVALID_CODE" }), /kennen wir nicht/);
  assert.match(familyError({ message: "ALREADY_MEMBER" }), /schon in einer Familie/);
  assert.match(familyError({ message: "FORBIDDEN" }), /nicht ändern/);
  assert.match(familyError({ message: "boom" }), /nicht geklappt/);
  // codes exactly as raised by the migration
  assert.match(familyError({ message: "FAMILY_SEAT_LIMIT" }), /schon ein Kind verbunden/);
  assert.match(familyError({ message: "FAMILY_SEAT_LIMIT", details: "In dieser Familie sind alle Plätze für Eltern belegt (1 von 1)." }), /zweites Elternteil/);
  assert.match(familyError({ message: "FAMILY_SEAT_LIMIT", details: "Weitere Kinder sind bald verfügbar." }), /Kontaktseite/, "the outdated DB detail is never shown");
  for (const code of ["SEATS_FULL", "FAMILY_SEAT_LIMIT"]) assert.doesNotMatch(familyError({ message: code }), /Zugang anfragen|bald verfügbar/i);
  assert.match(familyError({ message: "INVITE_USED" }), /schon verwendet/);
  assert.match(familyError({ message: "INVITE_INVALID" }), /kennen wir nicht/);
  assert.match(familyError({ message: "ALREADY_IN_FAMILY" }), /schon in einer Familie/);
  assert.match(familyError({ message: "INVITE_WRONG_ACCOUNT_TYPE", details: "Dieser Code ist für ein Elternkonto." }), /für ein Elternkonto\. Du bist als Schüler:in angemeldet/);
  assert.match(familyError({ message: "INVITE_WRONG_ACCOUNT_TYPE", details: "Dieser Code ist für ein Schülerkonto." }), /für ein Schülerkonto\. Du bist als Elternteil angemeldet/);
  assert.match(familyError({ message: "NOT_A_PARENT" }), /nicht ändern/);
  assert.equal(familyError({ message: "INVALID_NAME", details: "Der Familienname darf höchstens 80 Zeichen haben." }), "Der Familienname darf höchstens 80 Zeichen haben.");
  assert.equal(waitlistProblem("nope", ""), "Bitte gib eine gültige E-Mail-Adresse ein.");
  assert.equal(waitlistProblem("a@b.ch", "x".repeat(1001)), "Die Nachricht ist zu lang (höchstens 1000 Zeichen).");
  assert.equal(waitlistProblem(" a@b.ch ", "Hallo"), null);
});

test("role: parents land on /familie (invite links kept)", async () => {
  const role = await loadLib("role");
  assert.equal(role.parentLandingPath(null), "/familie");
  assert.equal(role.parentLandingPath("/dashboard"), "/familie");
  assert.equal(role.parentLandingPath("/teacher"), "/familie");
  assert.equal(role.parentLandingPath("/familie/einladung/ABCD1234"), "/familie/einladung/ABCD1234");
  assert.equal(role.parentLandingPath("https://evil.example"), "/familie");
});

test("source contract: family UI only uses the family RPCs, never the tables; no payment code; Swiss spelling", async () => {
  const files = ["lib/family.ts", "lib/family-core.ts", ...(await readdir(new URL("../components/family/", import.meta.url))).map((f) => `components/family/${f}`), "app/familie/page.tsx", "app/familie/einladung/[code]/page.tsx"];
  const all = (await Promise.all(files.map(read))).join("\n");
  assert.equal(/from\(\s*["'](families|family_members|family_invites|family_plans|waitlist_requests)/.test(all), false, "no direct table access");
  for (const rpc of ["family_get_my", "family_create", "family_create_invite", "family_join", "family_set_consent", "family_set_share", "family_child_overview", "family_remove_member", "family_leave", "family_export_my_data", "account_set_type", "waitlist_join"])
    assert.ok(all.includes(`"${rpc}"`), `uses ${rpc}`);
  assert.equal(/stripe|checkout|credit.?card|iban/i.test(all.replace(/CreditCard/g, "")), false, "no payment code");
  assert.equal(all.includes("ß"), false, "Swiss spelling (ss)");
  assert.match(all, /Bezahlung bald verfügbar/);
  assert.match(all, /Zugang anfragen/);
  const settings = await read("app/settings/page.tsx");
  assert.match(settings, /exportMyFamilyData\(\)\.catch/);
  const signup = await read("app/login/page.tsx");
  assert.match(signup, /signupMetadata\(role, birthYear\)/);
  const shell = await read("components/layout/workspace-shell.tsx");
  assert.match(shell, /const studentNav = \[\.\.\.navigation, familyItem\]/, "every student (also in a class) gets the family item (P9)");
  assert.match(shell, /loginNextFor\(pathname, window\.location\.search, window\.location\.hash\)/, "login redirect keeps query + hash (P7)");
  assert.match(shell, /storePendingInvite\(familyCode, "family"\)/, "a family invite survives the signup (P5)");
  assert.match(signup, /emailRedirectTo: confirmRedirect\(\)/, "confirmation link returns to this origin with ?next= (P5)");
  assert.match(signup, /signupPreset\(/, "family invite links preselect the signup role (P6)");
});
