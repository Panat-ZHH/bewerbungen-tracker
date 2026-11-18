// Reel fix 2 (stale-while-revalidate snapshots of the home screens): lib/snapshot-cache.ts + the clear-on-sign-out wiring.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";
import {
  SNAPSHOT_MAX_AGE_MS, SNAPSHOT_MAX_CHARS, applicationsSnapshotCodec, clearSnapshots, clearSnapshotsExcept, decodeApplicationSnapshot,
  readSnapshot, snapshotKey, toApplicationSnapshot, writeSnapshot,
} from "../lib/snapshot-cache.ts";
import { signOutEverywhere } from "../lib/sign-out.ts";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const NOW = Date.UTC(2026, 10, 18, 8);

class MemoryStorage {
  constructor() { this.map = new Map(); this.failSet = false; }
  get length() { return this.map.size; }
  key(i) { return [...this.map.keys()][i] ?? null; }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { if (this.failSet) { const e = new Error("QuotaExceededError"); e.name = "QuotaExceededError"; throw e; } this.map.set(k, String(v)); }
  removeItem(k) { this.map.delete(k); }
}

const app = (n, extra = {}) => ({
  id: `${A}-app-${n}`, company: `Firma ${n}`, position: "Informatiker/in EFZ", location: "Zürich", category: "it", status: "applied",
  deadline: "2026-12-01", appliedAt: "2026-11-10", createdAt: "2026-11-01", updatedAt: "2026-11-12", ...extra,
});
const decode = applicationsSnapshotCodec.decode;
const opts = (storage, now = NOW) => ({ storage, now });

test("round trip: stored list is read back for the same user, key wa:snap:v1:<userId>:<name>", () => {
  const s = new MemoryStorage();
  assert.equal(writeSnapshot(A, "applications", toApplicationSnapshot([app(1), app(2)]), opts(s)), true);
  assert.equal(snapshotKey(A, "applications"), `wa:snap:v1:${A}:applications`);
  assert.ok(s.getItem(`wa:snap:v1:${A}:applications`));
  const snap = readSnapshot(A, "applications", decode, opts(s, NOW + 1000));
  assert.equal(snap.savedAt, NOW);
  assert.deepEqual(snap.data.map((a) => a.company), ["Firma 1", "Firma 2"]);
});

test("TTL: older than 7 days (or from the future) is not shown and is removed", () => {
  const s = new MemoryStorage();
  writeSnapshot(A, "applications", [], opts(s));
  assert.ok(readSnapshot(A, "applications", decode, opts(s, NOW + SNAPSHOT_MAX_AGE_MS)));
  assert.equal(readSnapshot(A, "applications", decode, opts(s, NOW + SNAPSHOT_MAX_AGE_MS + 1)), null);
  assert.equal(s.length, 0, "expired entry removed");
  writeSnapshot(A, "applications", [], opts(s, NOW + 3_600_000));
  assert.equal(readSnapshot(A, "applications", decode, opts(s, NOW)), null, "savedAt in the future");
});

test("user mismatch: another user never gets A's snapshot, even if the entry is copied under B's key", () => {
  const s = new MemoryStorage();
  writeSnapshot(A, "applications", toApplicationSnapshot([app(1)]), opts(s));
  assert.equal(readSnapshot(B, "applications", decode, opts(s)), null);
  s.setItem(snapshotKey(B, "applications"), s.getItem(snapshotKey(A, "applications"))); // tampered / copied entry
  assert.equal(readSnapshot(B, "applications", decode, opts(s)), null, "userId inside the entry must match");
  assert.equal(s.getItem(snapshotKey(B, "applications")), null, "bad entry removed");
  for (const bad of [null, undefined, "", "a:b", "x".repeat(100)]) {
    assert.equal(readSnapshot(bad, "applications", decode, opts(s)), null);
    assert.equal(writeSnapshot(bad, "applications", [], opts(s)), false);
  }
  assert.equal(writeSnapshot(A, "admin", [], opts(s)), false, "only allow-listed names");
});

test("corrupt JSON / wrong version / malformed data: null and the entry is removed", () => {
  const s = new MemoryStorage();
  const key = snapshotKey(A, "applications");
  for (const raw of ["{not json", "null", "42", JSON.stringify({ v: 2, userId: A, savedAt: NOW, data: [] }),
    JSON.stringify({ v: 1, userId: A, savedAt: "x", data: [] }), JSON.stringify({ v: 1, userId: A, savedAt: NOW, data: [{ id: 1 }] }),
    JSON.stringify({ v: 1, userId: A, savedAt: NOW, data: { length: 1 } })]) {
    s.setItem(key, raw);
    assert.equal(readSnapshot(A, "applications", decode, opts(s)), null, raw);
    assert.equal(s.getItem(key), null, `removed: ${raw}`);
  }
});

test("quota error / blocked storage: write returns false, keeps going, and drops the outdated entry", () => {
  const s = new MemoryStorage();
  writeSnapshot(A, "applications", toApplicationSnapshot([app(1)]), opts(s));
  s.failSet = true;
  assert.equal(writeSnapshot(A, "applications", toApplicationSnapshot([app(1), app(2)]), opts(s)), false);
  assert.equal(s.getItem(snapshotKey(A, "applications")), null, "old picture not left behind");
  const blocked = { get length() { throw new Error("SecurityError"); }, key() { throw new Error("SecurityError"); }, getItem() { throw new Error("SecurityError"); }, setItem() { throw new Error("SecurityError"); }, removeItem() { throw new Error("SecurityError"); } };
  assert.equal(writeSnapshot(A, "applications", [], opts(blocked)), false);
  assert.equal(readSnapshot(A, "applications", decode, opts(blocked)), null);
  assert.doesNotThrow(() => { clearSnapshots(opts(blocked)); clearSnapshotsExcept(A, opts(blocked)); });
  assert.equal(readSnapshot(A, "applications", decode, { storage: null }), null, "no storage (SSR / private mode)");
});

test("size cap: entries over ~100 KB are skipped (and an older one removed)", () => {
  const s = new MemoryStorage();
  writeSnapshot(A, "applications", [], opts(s));
  const big = [{ ...app(1), company: "x".repeat(SNAPSHOT_MAX_CHARS) }];
  assert.equal(writeSnapshot(A, "applications", big, opts(s)), false);
  assert.equal(s.length, 0);
});

test("snapshot keeps only listed fields: no notes, job text, contacts, salary or links", () => {
  const full = app(1, { notes: "privat", jobDescription: "lang", contactName: "Frau X", contactInfo: "x@y.ch", schnupperNotes: "n", jobUrl: "https://x", salaryMin: 1, matchScore: 80 });
  const [row] = toApplicationSnapshot([full]);
  assert.deepEqual(Object.keys(row).sort(), ["appliedAt", "category", "company", "createdAt", "deadline", "id", "location", "position", "status", "updatedAt"]);
  const round = decodeApplicationSnapshot(JSON.parse(JSON.stringify([row])));
  assert.equal(round[0].notes, undefined);
  assert.equal(decodeApplicationSnapshot(Array.from({ length: 301 }, (_, i) => app(i))), null, "row cap");
});

test("clearSnapshots removes every wa:snap:* key (all users, all versions) and nothing else", () => {
  const s = new MemoryStorage();
  writeSnapshot(A, "applications", [], opts(s));
  writeSnapshot(B, "applications", [], opts(s));
  s.setItem(`wa:snap:v0:${A}:dashboard`, "{}");
  s.setItem("wendapply-theme", "dark");
  s.setItem("wa:draft", "keep");
  clearSnapshots(opts(s));
  assert.deepEqual([...s.map.keys()].sort(), ["wa:draft", "wendapply-theme"]);
});

test("clearSnapshotsExcept keeps only the current user's snapshots", () => {
  const s = new MemoryStorage();
  writeSnapshot(A, "applications", [], opts(s));
  writeSnapshot(B, "applications", [], opts(s));
  s.setItem(`wa:snap:v0:${A}:applications`, "{}");
  clearSnapshotsExcept(B, opts(s));
  assert.deepEqual([...s.map.keys()], [snapshotKey(B, "applications")]);
  clearSnapshotsExcept("", opts(s));
  assert.equal(s.length, 0, "invalid id: clear all");
});

test("sign-out: signOutEverywhere clears the snapshots, also when the server revoke fails", async () => {
  const s = new MemoryStorage();
  globalThis.window = { localStorage: s };
  try {
    for (const auth of [{ signOut: async () => ({ error: null }) }, { signOut: async ({ scope }) => { if (scope === "global") throw new Error("offline"); } }]) {
      writeSnapshot(A, "applications", [], { now: NOW });
      assert.equal(s.length, 1);
      await signOutEverywhere(auth);
      assert.equal(s.length, 0);
    }
  } finally { delete globalThis.window; }
});

test("wiring: every sign-out / user-switch path clears the snapshots", () => {
  const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
  const shell = read("components/layout/workspace-shell.tsx");
  // user switch / signed out in rememberUser (called for the local session, the background getUser() check and onAuthStateChange)
  assert.match(shell, /function rememberUser[\s\S]{0,400}if \(user\) clearSnapshotsExcept\(user\.id\); else clearSnapshots\(\);/);
  // session missing or refused -> /login redirect
  assert.match(shell, /if \(checkingSession \|\| user\) return;\s*clearSnapshots\(\);[\s\S]{0,600}router\.replace\(next \? `\/login/);
  // menu logout
  assert.match(shell, /async function logout\(\)[\s\S]{0,200}signOutEverywhere\(supabase\.auth\);[^\n]*\n\s*clearSnapshots\(\);/);
  assert.match(read("lib/sign-out.ts"), /signOutEverywhere[\s\S]{0,120}clearSnapshots\(\);/);
  assert.match(read("components/settings/delete-account.tsx"), /signOut\(\{ scope: "local" \}\)[^\n]*\n\s*clearSnapshots\(\);/);
  assert.match(read("components/admin/admin-app.tsx"), /async function reauth[\s\S]{0,80}clearSnapshots\(\);/);
  assert.match(read("components/admin/logout-button.tsx"), /signOutEverywhere\(supabase\.auth\)/, "admin logout uses signOutEverywhere (clears)");
  // only the user's own application list is cached; never admin / family / teacher / job search / documents
  const users = ["app/dashboard/page.tsx", "app/applications/page.tsx"];
  for (const p of users) assert.match(read(p), /useSnapshotData\("applications", getApplications, applicationsSnapshotCodec\)/, p);
  const walk = (dir) => readdirSync(new URL(`../${dir}`, import.meta.url), { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(`${dir}/${e.name}`) : /\.tsx?$/.test(e.name) ? [`${dir}/${e.name}`] : []);
  const callers = [...walk("app"), ...walk("components")].filter((p) => /useSnapshotData\(|writeSnapshot\(|readSnapshot\(/.test(read(p)));
  assert.deepEqual(callers.sort(), [...users, "components/ui/use-snapshot.ts"].sort());
});
