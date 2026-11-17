// Security re-audit 3 (2026-11-17). Calendar feed: an IP that is over the miss limit gets 429 even for well-formed
// tokens, BEFORE any database lookup (the per-IP limit used to be bypassed by every well-formed token).
import assert from "node:assert/strict";
import { test } from "node:test";
import { register } from "node:module";

register("./helpers/alias-hooks.mjs", import.meta.url);

const rl = await import("../lib/rate-limit/index.ts");
const api = await import("../lib/api-rate-limit.ts");

test("calendar feed: over-limit IP is refused before the token lookup, also for well-formed tokens; peekIp counts nothing", async () => {
  for (const k of Object.keys(process.env)) if (k.startsWith("RATE_LIMIT_")) delete process.env[k];
  delete process.env.NEXT_PUBLIC_SUPABASE_URL; delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.RATE_LIMIT_ICS_FEED_MISS_IP = "2";
  const mem = rl.memoryRateLimitRpc();
  rl.setRateLimitRpc(mem);
  const route = await import("../app/api/ics/feed/[token]/route.ts");
  const headers = { "x-nf-client-connection-ip": "192.0.2.91" };
  const call = (token) => route.GET(new Request(`http://x/api/ics/feed/${token}`, { headers }), { params: Promise.resolve({ token }) });
  const good = "a".repeat(64);
  // Under the limit a well-formed token reaches the lookup (no admin client in tests → 503, no-store).
  const r0 = await call(good);
  assert.equal(r0.status, 503);
  assert.equal(r0.headers.get("cache-control"), "no-store");
  // Peeking never adds to the count.
  const before = JSON.stringify([...mem.counts.entries()]);
  await api.peekIp("ics-feed-miss", new Headers(headers));
  assert.equal(JSON.stringify([...mem.counts.entries()]), before);
  assert.equal((await call("short")).status, 404);
  assert.equal((await call("short")).status, 404);
  assert.equal((await call("short")).status, 429);
  // Now even a well-formed token from this IP is refused without a lookup.
  const r = await call(good);
  assert.equal(r.status, 429);
  assert.ok(Number(r.headers.get("retry-after")) >= 1);
  assert.ok([...mem.counts.keys()].every((k) => !k.includes(good)));
  rl.setRateLimitRpc(null);
});
