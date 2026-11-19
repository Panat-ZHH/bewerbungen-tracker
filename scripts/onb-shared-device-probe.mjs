// QA-ONB M1 regression (shared computer): copy of _onboarding/qa/qa-browser-probe.mjs section A, pointed at this tree.
// Person 1 (Lena) walks the funnel to «Konto erstellen» and leaves; person 2 (Ben, existing student account, 3 days old, no
// funnel/onboarding) logs in with e-mail + password in the same browser. Lena's answers / role must never reach funnel_apply.
//   node scripts/onb-shared-device-probe.mjs            # spawns/reuses a stub dev server on :3242 (no live Supabase)
//   BASE=http://localhost:3242 PORT=3242 node scripts/onb-shared-device-probe.mjs
import { join } from "node:path";
const ROOT = join(import.meta.dirname, "..");
process.env.PLAYWRIGHT ||= "/Users/panat.ruangsri/Projects/bewerbungen-tracker-wt/audit-tools/node_modules/playwright-core/index.mjs";
const lib = await import("./onb-lib.mjs");
const drv = await import("./onb-driver.mjs");
const { createOnbWorld, loadPlaywright, findChrome, startDevServer } = lib;
const { walk, slugOf, waitPath, vis, ANSWERS, PW } = drv;
const PORT = Number(process.env.PORT || 3242);
const server = await startDevServer({ root: ROOT, port: PORT });
const BASE = process.env.BASE || server.base;
const pw = await loadPlaywright();
const browser = await pw.chromium.launch({ executablePath: findChrome(), headless: true });
const results = [];
const rec = (id, ok, detail = "") => { results.push({ id, ok, detail }); console.log(`${ok ? "PASS" : "FAIL"} ${id} ${detail}`); };
async function open(world) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: "de-CH" });
  await world.install(ctx, {});
  return { ctx, page: await ctx.newPage() };
}
const run = async (id, fn) => { try { await fn(); } catch (e) { rec(id, false, "EXC " + String(e.message).split("\n")[0].slice(0, 200)); } };
async function login(page, email) {
  await page.goto(`${BASE}/login?anmelden=1`);
  await page.getByLabel(/E-Mail/).first().waitFor({ timeout: 60000 }); await page.waitForTimeout(3000);
  await page.getByLabel(/E-Mail/).first().fill(email); await page.getByLabel(/^Passwort$/).first().fill(PW);
  await page.getByRole("button", { name: /^Anmelden/ }).last().click();
  await waitPath(page, /^\/(dashboard|familie|teacher|start|schullizenz|onboarding)/, 40000); await page.waitForTimeout(2500);
}
const leftover = (page) => page.evaluate(() => localStorage.getItem("wendapply.funnel.v1"));

await run("A1-shared-device-student", async () => {
  const world = createOnbWorld({ base: BASE, existing: [{ email: "ben@beispiel.ch", role: "student", createdDaysAgo: 3, profile: { first_name: "Ben" } }] });
  const { ctx, page } = await open(world);
  await page.goto(`${BASE}/start`); await vis(page.getByRole("heading", { name: /Dein Weg/ }), 60000);
  await walk(page, "student", { ...ANSWERS.student, firstName: "Lena" });
  rec("A1.reached-konto", slugOf(page) === "konto");
  await login(page, "ben@beispiel.ch");
  const calls = world.calls("funnel_apply");
  const prof = world.profileOf("ben@beispiel.ch");
  rec("A1.other-persons-answers-NOT-applied", calls.every((c) => c?.body?.p_answers == null) && prof?.first_name !== "Lena",
    `calls=${calls.length} p_answers=${JSON.stringify(calls.map((c) => c?.body?.p_answers ?? null))} → Ben first_name=${prof?.first_name} birth_year=${prof?.birth_year} url=${page.url().replace(BASE, "")}`);
  rec("A1.leftover-copy-cleared", (await leftover(page)) === null);
  await ctx.close();
});
await run("A2-shared-device-staff", async () => {
  const world = createOnbWorld({ base: BASE, existing: [{ email: "ben2@beispiel.ch", role: "student", createdDaysAgo: 3, profile: { first_name: "Ben" } }] });
  const { ctx, page } = await open(world);
  await page.goto(`${BASE}/start`); await vis(page.getByRole("heading", { name: /Dein Weg/ }), 60000);
  await walk(page, "staff", ANSWERS.staff);
  await login(page, "ben2@beispiel.ch");
  const calls = world.calls("funnel_apply");
  const path = new URL(page.url()).pathname;
  rec("A2.staff-copy-NOT-applied-to-pupil", calls.every((c) => c?.body?.p_answers?.role !== "staff") && !/^\/teacher/.test(path),
    `calls=${calls.length} roles=${JSON.stringify(calls.map((c) => c?.body?.p_answers?.role ?? null))} url=${page.url().replace(BASE, "")}`);
  rec("A2.leftover-copy-cleared", (await leftover(page)) === null);
  await ctx.close();
});

await browser.close();
await server.stop?.();
const fail = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - fail}/${results.length} PASS`);
process.exit(fail ? 1 : 0);
