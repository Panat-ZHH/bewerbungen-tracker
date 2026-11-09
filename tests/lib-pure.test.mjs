import assert from "node:assert/strict";
import { test } from "node:test";
import { calculateMatchScore } from "../lib/match-score.ts";
import { originalSourceName, listingSources, mergeJobResults } from "../lib/job-results.ts";
import { statusLabels, cn } from "../lib/utils.ts";
import { ISLANDS, BRIDGE_LANDING_DEPTH } from "../lib/islands-config.ts";
import { badgeText, badgeLabel, countIncoming, parseMock } from "../lib/friend-badge.ts";
import { loadLib } from "./helpers/load-lib.mjs";

test("match score stays within 0..100 and rewards matching category, CV type and details", () => {
  const strong = calculateMatchScore({ position: "Senior Frontend Developer", category: "informatik", cvType: "developer", jobDescription: "react typescript software engineer" });
  const weak = calculateMatchScore({ position: "x", category: "informatik", cvType: "finance" });
  assert.ok(strong > weak, `${strong} > ${weak}`);
  for (const category of ["informatik", "detailhandel", "kaufmaennisch", "finanz-recht", "gesundheit", "other"]) {
    for (const cvType of [undefined, "developer", "sales", "finance", "other"]) {
      for (const jobDescription of [undefined, "", "   ", "bank finance sales developer ".repeat(50)]) {
        const score = calculateMatchScore({ position: "Developer Position Title", category, cvType, jobDescription });
        assert.ok(Number.isInteger(score) && score >= 0 && score <= 100, `${category}/${cvType}: ${score}`);
      }
    }
  }
});

test("match score: matching CV type beats mismatching, empty description is penalised", () => {
  const base = { position: "Software Engineer", category: "informatik" };
  assert.ok(calculateMatchScore({ ...base, cvType: "developer" }) > calculateMatchScore({ ...base, cvType: "sales" }));
  assert.ok(calculateMatchScore({ ...base, jobDescription: "details" }) > calculateMatchScore(base));
  assert.equal(calculateMatchScore({ position: "abc", category: "other" }), 15 + 20 + 8 + 8);
});

test("originalSourceName only accepts exact https detail URLs of known sources", () => {
  assert.equal(originalSourceName("https://www.jobs.ch/de/stellenangebote/detail/abc-123/"), "jobs.ch");
  assert.equal(originalSourceName("https://www.jobup.ch/fr/emplois/detail/abc/"), "jobup.ch");
  assert.equal(originalSourceName("https://www.yousty.ch/de-CH/lehrstellen/profile/123-firma"), "Yousty");
  for (const bad of ["http://www.jobs.ch/de/stellenangebote/detail/abc/", "https://user:pw@www.jobs.ch/de/stellenangebote/detail/abc/", "https://evil.example/de/stellenangebote/detail/abc/", "https://www.jobs.ch/other/", "not a url", ""]) assert.equal(originalSourceName(bad), undefined, bad);
});

test("listingSources deduplicates by url and mergeJobResults is idempotent", () => {
  const r = { title: "Informatiker EFZ", company: "Muster AG", location: "8000 Zürich", url: "https://a.example/1", source: "A" };
  assert.deepEqual(listingSources({ ...r, sources: [{ name: "A", url: r.url }] }).length, 1);
  const once = mergeJobResults([], [r]);
  assert.equal(mergeJobResults(once, [r]).length, 1);
  assert.equal(mergeJobResults([], []).length, 0);
});

test("statusLabels covers every status with German text and 'offer' reads Zusage", () => {
  assert.deepEqual(Object.keys(statusLabels).sort(), ["applied", "aptitude_test", "contract_signed", "final_interview", "interview", "offer", "preparing", "rejected", "saved", "schnupper_done", "schnupper_planned", "withdrawn"]);
  assert.equal(statusLabels.offer, "Zusage");
  for (const label of Object.values(statusLabels)) assert.ok(label.length > 2);
  assert.equal(cn("p-2", false && "x", "p-4"), "p-4");
});

test("islands config is consistent: ordered, priced ascending, bridges outside land, focus on land", () => {
  assert.deepEqual(ISLANDS.map((i) => i.no), [1, 2, 3, 4]);
  assert.equal(ISLANDS[0].price, 0);
  for (let i = 1; i < ISLANDS.length; i++) assert.ok(ISLANDS[i].price > ISLANDS[i - 1].price);
  const overlap = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1;
  for (const island of ISLANDS) {
    assert.ok(island.area.x1 > island.area.x0 && island.area.z1 > island.area.z0);
    assert.ok(island.focus.x >= island.area.x0 && island.focus.x < island.area.x1 && island.focus.z >= island.area.z0 && island.focus.z < island.area.z1, `focus of island ${island.no}`);
    assert.equal(island.bridge === null, island.no === 1);
    if (island.bridge) assert.ok(island.bridgeAxis === "x" || island.bridgeAxis === "z");
    for (const other of ISLANDS) if (other.no !== island.no) assert.ok(!overlap(island.area, other.area), `islands ${island.no}/${other.no} overlap`);
    if (island.bridge) for (const other of ISLANDS) assert.ok(!overlap(island.bridge, other.area), `bridge of ${island.no} overlaps island ${other.no}`);
  }
  assert.ok(BRIDGE_LANDING_DEPTH > 0);
});

test("friend badge helpers", () => {
  assert.equal(badgeText(0), ""); assert.equal(badgeText(-3), ""); assert.equal(badgeText(9), "9"); assert.equal(badgeText(10), "9+");
  assert.match(badgeLabel(1), /^1 offene Freundschaftsanfrage$/); assert.match(badgeLabel(4), /^4 offene Freundschaftsanfragen$/);
  assert.equal(countIncoming([{ state: "incoming" }, { state: "friend" }, { state: "outgoing" }, { state: "incoming" }]), 2);
  assert.equal(parseMock(undefined), null); assert.equal(parseMock(" "), null); assert.equal(parseMock("abc"), null); assert.equal(parseMock("-2"), 0); assert.equal(parseMock("3.9"), 3);
});

test("social.ts: error codes, invite links and row mapping", async () => {
  const social = await loadLib("social");
  assert.equal(social.socialErrorCode(new Error("Database error: P0001 | USER_NOT_FOUND")), "USER_NOT_FOUND");
  assert.equal(social.socialErrorCode("ALREADY_FRIENDS"), "ALREADY_FRIENDS");
  assert.equal(social.socialErrorCode(new Error("boom")), undefined);
  assert.equal(social.socialErrorCode(null), undefined);
  assert.equal(social.inviteLink("AB CD", "https://x.test"), "https://x.test/invite/AB%20CD");
  globalThis.__supabaseStub = { rpc: async (name) => name === "social_list" ? { data: [{ id: "1", other_user_id: "u", display_name: "Anna", avatar_seed: "s", role: "student", state: "incoming", created_at: "2026-01-01" }], error: null } : { data: null, error: { code: "P0001", message: "NOT_FOUND" } } };
  const list = await social.listConnections();
  assert.deepEqual(list[0], { id: "1", otherUserId: "u", displayName: "Anna", avatarSeed: "s", role: "student", state: "incoming", createdAt: "2026-01-01" });
  await assert.rejects(() => social.findUserByCode("zz"), (e) => social.socialErrorCode(e) === "NOT_FOUND" && e.code === "P0001");
  globalThis.__supabaseStub = { rpc: async () => ({ data: [], error: null }) };
  assert.equal(await social.findUserByCode("none"), undefined);
});

test("classes.ts: error codes, invite link, preview/overview mapping", async () => {
  const classes = await loadLib("classes");
  assert.equal(classes.classErrorCode(new Error("FORBIDDEN")), "FORBIDDEN");
  assert.equal(classes.classErrorCode(new Error("CLASS_NOT_FOUND here")), "CLASS_NOT_FOUND");
  assert.equal(classes.classErrorCode("???"), undefined);
  assert.equal(classes.classInviteLink("K 1", "https://x.test"), "https://x.test/classes/join/K%201");
  globalThis.__supabaseStub = { rpc: async (name) => {
    if (name === "class_preview") return { data: [{ class_id: "c", name: "4a", school_year: "25/26", teacher_name: "Frau M", member_count: 3, already_member: true }], error: null };
    if (name === "class_student_applications") return { data: [{ hidden: true, id: null }], error: null };
    return { data: [{ student_id: "s", display_name: "Ben", avatar_seed: "x", hidden: false, total: 2, status_counts: null, last_7_days: 1, last_30_days: 2, latest_company: null, latest_position: null, latest_status: null, latest_date: null, upcoming_deadlines: null }], error: null };
  } };
  assert.deepEqual(await classes.previewClass("K"), { classId: "c", name: "4a", schoolYear: "25/26", teacherName: "Frau M", memberCount: 3, alreadyMember: true });
  assert.deepEqual(await classes.getClassStudentApplications("c", "s"), { hidden: true, applications: [] });
  const [row] = await classes.getClassOverview("c");
  assert.equal(row.latest, undefined); assert.deepEqual(row.statusCounts, {}); assert.deepEqual(row.upcomingDeadlines, []);
});
