import assert from "node:assert/strict";
import { test } from "node:test";
import { loadLib } from "./helpers/load-lib.mjs";

const lib = await loadLib("teacher");
const DAY = 86_400_000;

test("error codes and German messages", () => {
  assert.equal(lib.teacherErrorCode(new Error("Database error: P0001 | RATE_LIMITED")), "RATE_LIMITED");
  assert.equal(lib.teacherErrorCode(new Error("INVITE_INVALID")), "INVITE_INVALID");
  assert.equal(lib.teacherErrorCode(new Error("CLASS_NOT_FOUND")), "CLASS_NOT_FOUND"); // not mistaken for NOT_FOUND
  assert.equal(lib.teacherErrorCode(new Error("INVALID_EMAIL")), "INVALID_EMAIL");
  assert.equal(lib.teacherErrorCode("boom"), undefined);
  assert.equal(lib.teacherErrorCode(undefined), undefined);
  assert.match(lib.teacherErrorMessage(new Error("EXPIRED")), /abgelaufen/);
  assert.match(lib.teacherErrorMessage(new Error("???")), /nicht geklappt/);
});

test("join input: tokens (>=22 url-safe chars) vs short codes", () => {
  const token = "a".repeat(64);
  assert.deepEqual(lib.parseJoinInput(token), { kind: "token", value: token });
  assert.deepEqual(lib.parseJoinInput("Abc-_" + "x".repeat(20)).kind, "token");
  assert.deepEqual(lib.parseJoinInput("9gju6ned"), { kind: "code", value: "9GJU6NED" });
  assert.deepEqual(lib.parseJoinInput("%20ab12cd34%20"), { kind: "code", value: "AB12CD34" });
  assert.equal(lib.isInviteToken("a".repeat(21)), false);
  assert.equal(lib.isInviteToken("a".repeat(22)), true);
  assert.equal(lib.isInviteToken("a b" + "c".repeat(30)), false);
  assert.equal(lib.inviteLink("tok", "https://x.test"), "https://x.test/classes/join/tok");
});

test("email list parsing dedupes, lowercases and separates invalid entries", () => {
  const r = lib.parseEmailList("Anna@x.de, anna@x.de; ben@x.de\nkaputt  c@d.e ,, ");
  assert.deepEqual(r.valid, ["anna@x.de", "ben@x.de", "c@d.e"]);
  assert.deepEqual(r.invalid, ["kaputt"]);
  assert.deepEqual(lib.parseEmailList(""), { valid: [], invalid: [] });
  assert.equal(lib.isValidEmail("a@b"), false);
  assert.equal(lib.isValidEmail("a@b.ch"), true);
  assert.equal(lib.MAX_BULK_INVITES, 60);
});

test("invite status precedence and nudge cooldown", () => {
  const now = new Date("2026-11-06T12:00:00Z");
  const base = { revoked: false, expiresAt: new Date(now.getTime() + DAY).toISOString(), maxUses: null, uses: 0 };
  assert.equal(lib.inviteStatus(base, now), "active");
  assert.equal(lib.inviteStatus({ ...base, maxUses: 2, uses: 1 }, now), "active");
  assert.equal(lib.inviteStatus({ ...base, maxUses: 2, uses: 2 }, now), "used_up");
  assert.equal(lib.inviteStatus({ ...base, expiresAt: now.toISOString() }, now), "expired");
  assert.equal(lib.inviteStatus({ ...base, revoked: true, expiresAt: new Date(0).toISOString() }, now), "revoked");
  assert.equal(lib.nextNudgeAt(null, now), null);
  assert.equal(lib.nextNudgeAt(new Date(now.getTime() - 4 * DAY).toISOString(), now), null);
  assert.equal(lib.nextNudgeAt(new Date(now.getTime() - 1 * DAY).toISOString(), now).getTime(), now.getTime() + 2 * DAY);
  assert.equal(lib.placedPercent(1, 4), 25);
  assert.equal(lib.placedPercent(0, 0), 0);
  assert.match(lib.inviteReasonText("WRONG_EMAIL"), /andere/);
  assert.equal(lib.inviteReasonText(null), "");
});

test("RPC wrappers map snake_case rows to camelCase and send the contract parameter names", async () => {
  const calls = [];
  globalThis.__supabaseStub = { rpc: async (name, args) => {
    calls.push([name, args]);
    const rows = {
      teacher_dashboard: { totals: { students: 4, deadlines_7d: 1, hidden_students: 1 }, classes: [{ id: "c", name: "10a", school_year: "26", archived: false, is_owner: true, join_code: "X", students: 4, hidden: 1 }], deadlines: [{ class_id: "c", class_name: "10a", student_id: "s", student_name: "A", company: "Alpha", position: "P", deadline: "2026-11-09" }] },
      teacher_class_students: [{ student_id: "s", display_name: "A", avatar_seed: "x", joined_at: "t", hidden: false, total: 2, status_counts: { offer: 1 }, interviews: 0, offers: 1, placed: true, last_activity: null, inactive: true, last_nudged_at: null }],
      class_student_timeline: [{ hidden: false, application_id: "a", company: null, position: null, status: "offer", event_date: "2026-11-01", kind: "applied" }],
      class_invite_preview: [{ class_id: null, name: null, school_year: null, teacher_name: null, member_count: null, already_member: false, valid: false, reason: "EXPIRED" }],
      class_list_mine: [{ id: "c", name: "10a", school_year: "26", join_code: "X", created_at: "t", member_count: 3, archived: true, is_owner: false }],
      class_my_classes: [{ class_id: "c", name: "10a", school_year: "26", teacher_name: "T", share_applications: true, joined_at: "t", share_companies: false, last_nudge_at: "n", announcements_count: 2, share_status: true }],
      my_notifications: [{ id: "n", kind: "nudge", class_id: "c", class_name: "10a", message: null, created_at: "t", read: false }],
    };
    return { data: rows[name] ?? null, error: null };
  } };
  const dash = await lib.getTeacherDashboard(7);
  assert.deepEqual(calls.at(-1), ["teacher_dashboard", { p_inactive_days: 7 }]);
  assert.equal(dash.totals.deadlines7d, 1); assert.equal(dash.totals.hiddenStudents, 1); assert.equal(dash.classes[0].isOwner, true); assert.equal(dash.deadlines[0].studentName, "A");
  const [stu] = await lib.getTeacherClassStudents("c");
  assert.deepEqual(calls.at(-1), ["teacher_class_students", { p_class_id: "c", p_inactive_days: 14 }]);
  assert.deepEqual([stu.displayName, stu.placed, stu.inactive, stu.statusCounts.offer, stu.lastActivity], ["A", true, true, 1, null]);
  const tl = await lib.getStudentTimeline("c", "s");
  assert.deepEqual([tl.hidden, tl.events[0].company, tl.events[0].eventDate, tl.events[0].kind], [false, null, "2026-11-01", "applied"]);
  const prev = await lib.previewInvite("tok");
  assert.deepEqual([prev.valid, prev.reason, prev.name], [false, "EXPIRED", null]);
  assert.deepEqual((await lib.listTeacherClasses())[0], { id: "c", name: "10a", schoolYear: "26", joinCode: "X", createdAt: "t", memberCount: 3, archived: true, isOwner: false });
  const m = (await lib.getMyMemberships())[0];
  assert.deepEqual([m.shareCompanies, m.shareStatus, m.lastNudgeAt, m.announcementsCount], [false, true, "n", 2]);
  assert.deepEqual((await lib.listNotifications())[0], { id: "n", kind: "nudge", classId: "c", className: "10a", message: null, createdAt: "t", read: false });
  await lib.setClassSharingV2("c", true, { companies: false });
  assert.deepEqual(calls.at(-1), ["class_set_sharing_v2", { p_class_id: "c", p_share: true, p_companies: false, p_status: null }]);
  await lib.createInvite("c", { email: "a@b.de", maxUses: 1 }).catch(() => {});
  assert.deepEqual(calls.at(-1), ["class_invite_create", { p_class_id: "c", p_email: "a@b.de", p_max_uses: 1, p_expires_in_days: 14 }]);
  await lib.nudgeStudent("c", "s", "hi"); assert.deepEqual(calls.at(-1), ["class_nudge", { p_class_id: "c", p_student_id: "s", p_message: "hi" }]);
  await lib.setMyRole("teacher"); assert.deepEqual(calls.at(-1), ["set_my_role", { p_role: "teacher" }]);
  globalThis.__supabaseStub = { rpc: async () => ({ data: null, error: { code: "P0001", message: "RATE_LIMITED" } }) };
  await assert.rejects(lib.nudgeStudent("c", "s"), (e) => lib.teacherErrorCode(e) === "RATE_LIMITED");
  delete globalThis.__supabaseStub;
});
