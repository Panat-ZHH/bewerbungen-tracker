// Reel waterfall part (2026-11-18): parallel guard reads, shared class_my_classes read, notices reuse window, measurement helpers.
import assert from "node:assert/strict";
import { test, beforeEach } from "node:test";
import { readFileSync } from "node:fs";
import { loadLib } from "./helpers/load-lib.mjs";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const tick = () => new Promise((r) => setTimeout(r, 0));
const userA = { id: "user-a", user_metadata: { role: "teacher", role_confirmed: true, teacher_onboarded: true } };
const userB = { id: "user-b", user_metadata: { role: "student" } };
let calls;
let sessionUser;
function stub(rpc) {
  calls = [];
  globalThis.__supabaseStub = {
    getSession: async () => ({ data: { session: sessionUser ? { user: sessionUser } : null }, error: null }),
    rpc: async (name, args) => { calls.push(name); return rpc ? rpc(name, args) : { data: [], error: null }; },
  };
}
beforeEach(() => { sessionUser = userA; stub(); });

// ---------------------------------------------------------------- measurement helpers (scripts/perf-slow-network.mjs)
test("perf script: waterfall depth = longest chain of requests that each start after the previous ended", async () => {
  const { waterfall, median } = await import("../scripts/perf-slow-network.mjs");
  assert.deepEqual(waterfall([{ name: "a", start: 0, end: 100 }, { name: "b", start: 1, end: 90 }, { name: "c", start: 2, end: 120 }]), { depth: 1, chain: ["a"] });
  const chain = waterfall([{ name: "auth", start: 0, end: 100 }, { name: "role", start: 101, end: 200 }, { name: "access", start: 201, end: 300 }, { name: "side", start: 150, end: 160 }]);
  assert.equal(chain.depth, 3);
  assert.deepEqual(chain.chain, ["auth", "role", "access"]);
  assert.equal(waterfall([{ name: "open", start: 0 }]).depth, 0); // unfinished requests are ignored
  assert.equal(median([300, 100, 200]), 200);
  assert.equal(median([]), null);
});

test("perf script: three CDP profiles with the requested latency / throughput, npm script perf:slow", async () => {
  const { PROFILES } = await import("../scripts/perf-slow-network.mjs");
  assert.equal(PROFILES.none, null);
  assert.deepEqual([PROFILES.fast4g.latency, PROFILES.fast4g.downloadThroughput], [150, 9_000_000 / 8]);
  assert.deepEqual([PROFILES.slow.latency, PROFILES.slow.downloadThroughput], [400, 400_000 / 8]);
  assert.equal(JSON.parse(read("package.json")).scripts["perf:slow"], "node scripts/perf-slow-network.mjs");
});

// ---------------------------------------------------------------- shared class_my_classes read
test("class_my_classes: parallel callers (tab bar, class list, goals) share one request; nothing is cached after it", async () => {
  const classes = await loadLib("classes");
  const teacher = await loadLib("teacher");
  stub(async (name) => { await tick(); return { data: name === "class_my_classes" ? [{ class_id: "c1", name: "3a", school_year: "", teacher_name: "T", share_applications: true, joined_at: "2026-01-01" }] : [], error: null }; });
  const [v1, v2, t] = await Promise.all([classes.getMyClassMemberships(), classes.getMyClassMembershipsV2(), teacher.getMyMemberships()]);
  assert.deepEqual(calls, ["class_my_classes"]);
  assert.equal(v1[0].classId, "c1"); assert.equal(v2[0].classId, "c1"); assert.equal(v2[0].shareCompanies, true); assert.equal(t.length, 1);
  await classes.getMyClassMemberships();
  assert.deepEqual(calls, ["class_my_classes", "class_my_classes"], "a later read is a new request (no cache)");
});

test("class_my_classes: errors still reach every caller; another user or a class change never joins a running read", async () => {
  const classes = await loadLib("classes");
  stub(async () => { await tick(); return { data: null, error: { code: "42501", message: "FORBIDDEN" } }; });
  const results = await Promise.allSettled([classes.getMyClassMemberships(), classes.getMyClassMembershipsV2()]);
  assert.ok(results.every((r) => r.status === "rejected" && /FORBIDDEN/.test(r.reason.message)));
  assert.equal(calls.length, 1);

  stub(async () => { await tick(); return { data: [], error: null }; });
  const first = classes.getMyClassMemberships();
  await tick(); sessionUser = userB;
  await classes.getMyClassMemberships();
  await first;
  assert.equal(calls.length, 2, "user B does not get user A's answer");

  stub(async (name) => { await tick(); return { data: name === "class_leave" ? null : [], error: null }; });
  const before = classes.getMyClassMemberships();
  await classes.leaveClass("c1");
  await classes.getMyClassMemberships();
  await before;
  assert.equal(calls.filter((c) => c === "class_my_classes").length, 2, "the reload after leaving is a fresh read");
  assert.ok(calls.indexOf("class_leave") < calls.lastIndexOf("class_my_classes"));
});

// ---------------------------------------------------------------- notices
test("notices: a mount within the reuse window reuses the same user's list; focus, other users and failures read again", async () => {
  const notices = await loadLib("notices");
  assert.equal(notices.canReuseNotices({ userId: "a", at: 1000 }, "a", 2000, 15000), true);
  assert.equal(notices.canReuseNotices({ userId: "a", at: 1000 }, "b", 2000, 15000), false);
  assert.equal(notices.canReuseNotices({ userId: "a", at: 1000 }, "a", 17000, 15000), false);
  assert.equal(notices.canReuseNotices(null, "a", 2000, 15000), false);
  assert.equal(notices.canReuseNotices({ userId: "a", at: 1000 }, null, 2000, 15000), false);

  notices.resetNotices();
  stub(async () => ({ data: [{ id: "n1", kind: "nudge", class_id: null, class_name: null, message: "Hi", created_at: "2026-11-18", read: false }], error: null }));
  await notices.refreshNotices({ maxAgeMs: notices.NOTICES_REUSE_MS });
  await notices.refreshNotices({ maxAgeMs: notices.NOTICES_REUSE_MS });
  assert.deepEqual(calls, ["my_notifications"], "second mount reuses");
  await notices.refreshNotices();
  assert.equal(calls.length, 2, "focus (no maxAge) always reads");
  sessionUser = userB;
  await notices.refreshNotices({ maxAgeMs: notices.NOTICES_REUSE_MS });
  assert.equal(calls.length, 3, "another user reads again");

  notices.resetNotices();
  stub(async () => ({ data: null, error: { message: "offline" } }));
  await notices.refreshNotices({ maxAgeMs: notices.NOTICES_REUSE_MS });
  await notices.refreshNotices({ maxAgeMs: notices.NOTICES_REUSE_MS });
  assert.equal(calls.length, 2, "a failed read is never reused");
});

// ---------------------------------------------------------------- teacher guard
test("teacher guard: auth check, role and access start together; class list only when the onboarding check needs it", async () => {
  const { guardReads } = await loadLib("teacher-guard");
  const auth = [];
  let release;
  globalThis.__supabaseStub.getUser = () => { auth.push("getUser"); return new Promise((r) => { release = () => r({ data: { user: userA }, error: null }); }); };
  const reads = guardReads(userA, "/teacher");
  await tick(); await tick();
  assert.deepEqual(auth, ["getUser"]);
  assert.ok(calls.includes("social_my_profile") && calls.includes("my_access"), `started before the auth answer: ${calls}`);
  assert.equal(reads.classes, null, "onboarded teacher: no class list read");
  release();
  assert.equal((await reads.verified).data.user.id, "user-a");
  assert.equal(reads.userId, "user-a");

  stub();
  const notOnboarded = guardReads({ id: "user-c", user_metadata: { role: "teacher" } }, "/teacher");
  await tick(); await tick();
  assert.ok(calls.includes("class_list_mine"));
  assert.ok(notOnboarded.classes);
  stub();
  const none = guardReads(null, "/teacher");
  assert.deepEqual([none.role, none.access, none.classes, none.userId], [null, null, null, null]);
  await none.verified;
  assert.deepEqual(calls, [], "no session: only the auth check");
});

test("teacher layout: same checks in the same order, on the auth server's user; re-reads when the session changed", () => {
  const src = read("app/teacher/layout.tsx");
  const order = ["await reads.verified", "if (!user)", "needsRoleChoice(user)", "guardRedirect(role, pathname)", "accessView(", "LICENCE_PATH", 'view === "blocked"', "teacherOnboarded(user.user_metadata)", "ONBOARDING_PATH); return;", "setAllowed(true)"];
  let at = -1;
  for (const marker of order) { const i = src.indexOf(marker, at + 1); assert.ok(i > at, `order: ${marker}`); at = i; }
  assert.match(src, /same && reads\.role \? reads\.role : loadMyRole\(user\)/);
  assert.match(src, /same && reads\.access \? reads\.access : loadMyAccess\(\{ userId: user\.id \}\)/);
});

test("no extra auth-server round trip before /classes and /familie data; ClassesPage reuses the cached role, retry reads", () => {
  assert.doesNotMatch(read("app/classes/page.tsx"), /auth\.getUser\(/);
  assert.doesNotMatch(read("components/family/family-view.tsx"), /auth\.getUser\(/);
  const cp = read("components/classes/classes-page.tsx");
  assert.match(cp, /attempt === 0 && user \? cachedRole\(user\.id\)/);
  assert.match(cp, /getMySocialProfile\(\)/);
  assert.match(read("components/teacher/attention-panel.tsx"), /onRetry=\{\(\) => load\(\)\}/);
});
