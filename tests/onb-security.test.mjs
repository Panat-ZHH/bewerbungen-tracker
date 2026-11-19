// Onboarding sign-up security guards (SPEC-DATA §6.3), source checks over the funnel, login and callback code:
// no account enumeration via `identities`, no e-mail/password in web storage, resend keeps emailRedirectTo, signUp never branches
// on "already registered" in a way the UI could show. Owner: onb-integ (the spec row had no builder).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
async function walk(dir) {
  const out = [];
  for (const entry of await readdir(join(ROOT, dir), { withFileTypes: true })) {
    const rel = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(rel));
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(rel);
  }
  return out;
}
const SCOPES = ["components/funnel", "lib/funnel", "app/start", "app/login", "app/auth"];
const files = async () => (await Promise.all(SCOPES.map(walk))).flat();
const read = (rel) => readFile(join(ROOT, rel), "utf8");

test("no funnel/login/callback code reads `identities` (GoTrue's enumeration signal)", async () => {
  for (const rel of await files()) assert.doesNotMatch(await read(rel), /\bidentities\b/, rel);
});

test("web-storage writes in the funnel never carry an e-mail address or a password", async () => {
  for (const rel of await files()) {
    const src = await read(rel);
    for (const m of src.matchAll(/setItem\(([^;\n]*)/g)) assert.doesNotMatch(m[1], /email|password|passwort/i, `${rel}: ${m[0]}`);
  }
  // The persisted funnel state is written key by key from a known list (lib/funnel/storage.ts), never the raw object.
  const storage = await read("lib/funnel/storage.ts");
  assert.match(storage, /FUNNEL_KEY/);
  const types = await read("lib/funnel/types.ts");
  const state = types.match(/export (?:type|interface) FunnelStateV1[\s\S]*?\n\}/)?.[0] ?? "";
  assert.ok(state, "FunnelStateV1 found");
  assert.doesNotMatch(state, /\b(email|password)\??:/, "the persisted state type has no e-mail/password field");
});

test("every resend of the confirmation mail passes emailRedirectTo", async () => {
  let seen = 0;
  for (const rel of await files()) {
    const src = await read(rel);
    for (const m of src.matchAll(/auth\.resend\(([^\n]*)/g)) { seen++; assert.match(m[1], /emailRedirectTo/, `${rel}: ${m[0]}`); }
  }
  assert.ok(seen >= 2, "confirm page + login resend found");
});

test("signUp: «already registered» continues like a new sign-up (no enumeration) and /login never signs up", async () => {
  const account = await read("components/funnel/account.tsx");
  assert.match(account, /auth\.signUp\(/);
  assert.match(account, /!isAlreadyRegistered\(result\.error\)/, "already-registered is not shown as an error");
  assert.doesNotMatch(account, /Konto (existiert|gibt es) (bereits|schon)/);
  assert.doesNotMatch(await read("app/login/page.tsx"), /auth\.signUp\(/);
});
