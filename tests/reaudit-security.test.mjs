// Security re-audit 2026-11-17 (branch reaudit1-sec): DB-level regressions on PGlite with all migrations applied.
import assert from "node:assert/strict";
import { test } from "node:test";
import { setupTeacherDb, ids } from "./helpers/teacher-db.mjs";

test("cvs.storage_path must stay inside the owner's own folder (service role deletes recorded paths)", async () => {
  const db = await setupTeacherDb();
  const { as, rpc, code, admin } = db;
  await as(ids.s1);
  const own = `${ids.s1}/doc-${ids.s1}-abc-1234/Lebenslauf.pdf`;
  await rpc("insert into public.cvs (id, user_id, name, type, description, updated_at, status, storage_path) values ('d1', $1, 'CV', 'other', '', current_date, 'Ready', $2)", [ids.s1, own]);
  await rpc("insert into public.cvs (id, user_id, name, type, description, updated_at, status) values ('d2', $1, 'Text', 'other', '', current_date, 'Ready')", [ids.s1]);
  for (const bad of [`${ids.s2}/doc-x/victim.pdf`, `${ids.s1}/../${ids.s2}/x.pdf`, `${ids.s1}`, `${ids.s1}//x.pdf`, `/${ids.s2}/x.pdf`, `${ids.s1}/./x`, `${ids.s1}/a\\..\\b`]) {
    assert.match(await code(rpc("update public.cvs set storage_path = $1 where id = 'd1'", [bad])) ?? "accepted", /cvs_storage_path_own_folder/, bad);
    assert.match(await code(rpc("insert into public.cvs (id, user_id, name, type, description, updated_at, status, storage_path) values ('d3', $1, 'x', 'other', '', current_date, 'Ready', $2)", [ids.s1, bad])) ?? "accepted", /cvs_storage_path_own_folder/, bad);
  }
  // legit values still work
  assert.equal(await code(rpc("update public.cvs set storage_path = $1 where id = 'd1'", [`${ids.s1}/doc-${ids.s1}-zz/Zeugnis 2026 (final).pdf`])), null);
  assert.equal(await code(rpc("update public.cvs set storage_path = null where id = 'd2'")), null);
  const [{ n }] = await admin("select count(*)::int n from public.cvs where user_id = $1", [ids.s1]);
  assert.equal(n, 2);
  // idempotent
  await db.apply("20261117132000_cvs_storage_path_guard.sql");
});

test("web push: only real push services are contacted (no SSRF / digest stall), no redirects, timeout; route refuses others", async () => {
  const { isPushServiceEndpoint, sendPush, generateVapidKeys, MAX_PUSH_SUBSCRIPTIONS_PER_USER } = await import("../lib/reminders-push.ts");
  for (const ok of ["https://fcm.googleapis.com/fcm/send/abc", "https://updates.push.services.mozilla.com/wpush/v2/x", "https://web.push.apple.com/QF3", "https://wns2-am3p.notify.windows.com/w/?token=1"]) assert.ok(isPushServiceEndpoint(ok), ok);
  for (const bad of ["https://push.example/x", "http://fcm.googleapis.com/x", "https://fcm.googleapis.com.evil.ch/x", "https://169.254.169.254/latest", "https://user:pw@fcm.googleapis.com/x",
    "https://fcm.googleapis.com:8443/x", "https://evilnotify.windows.com.attacker.io/", "javascript:alert(1)", "", null, "https://" + "a".repeat(2000)]) assert.equal(isPushServiceEndpoint(bad), false, String(bad).slice(0, 60));
  assert.ok(MAX_PUSH_SUBSCRIPTIONS_PER_USER >= 1 && MAX_PUSH_SUBSCRIPTIONS_PER_USER <= 20);

  const { createECDH, randomBytes } = await import("node:crypto");
  const ua = createECDH("prime256v1"); ua.generateKeys();
  const keys = { p256dh: ua.getPublicKey().toString("base64url"), auth: randomBytes(16).toString("base64url") };
  const vapid = { ...generateVapidKeys(), subject: "mailto:test@wendapply.ch" };
  const calls = [];
  const fakeFetch = async (url, init) => { calls.push({ url, init }); return new Response(null, { status: 201 }); };
  const foreign = await sendPush({ endpoint: "https://attacker.example/hook", ...keys }, { title: "x" }, vapid, fakeFetch);
  assert.deepEqual(foreign, { ok: false, status: 0, gone: true }, "foreign host is dropped (row gets deleted)");
  assert.equal(calls.length, 0, "foreign host never contacted");
  const real = await sendPush({ endpoint: "https://fcm.googleapis.com/fcm/send/abc", ...keys }, { title: "x" }, vapid, fakeFetch);
  assert.equal(real.ok, true);
  assert.equal(calls[0].init.redirect, "manual");
  assert.ok(calls[0].init.signal instanceof AbortSignal);

  const { readFile } = await import("node:fs/promises");
  const route = await readFile(new URL("../app/api/reminders/push/route.ts", import.meta.url), "utf8");
  assert.match(route, /isPushServiceEndpoint\(endpoint\)/);
  const server = await readFile(new URL("../lib/reminders-server.ts", import.meta.url), "utf8");
  assert.match(server, /\.limit\(MAX_PUSH_SUBSCRIPTIONS_PER_USER\)/);
});

test("job search: only our own plain Error messages are shown, library/network errors get the generic text", async () => {
  const { readFile } = await import("node:fs/promises");
  const route = await readFile(new URL("../app/api/job-search/route.ts", import.meta.url), "utf8");
  assert.match(route, /Object\.getPrototypeOf\(cause\) === Error\.prototype/);
  assert.doesNotMatch(route, /error: cause instanceof Error \? cause\.message/);
});

test("AI review edge function: a forged Netlify client-IP header cannot dodge the per-IP limit on Supabase", async () => {
  const { keys } = await import("../supabase/functions/ai-review/limits.ts");
  const h = (extra) => new Headers({ "cf-connecting-ip": "198.51.100.7", ...extra });
  const real = await keys.ip(h({}));
  assert.equal(await keys.ip(h({ "x-nf-client-connection-ip": "203.0.113.1" })), real);
  assert.equal(await keys.ip(h({ "x-nf-client-connection-ip": "203.0.113.2" })), real);
  assert.notEqual(await keys.ip(new Headers({ "cf-connecting-ip": "198.51.100.8" })), real);
});
