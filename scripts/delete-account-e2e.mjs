// E2E for "Konto löschen" against the REAL Supabase project with THROWAWAY accounts created here (never a real user).
//   node scripts/delete-account-e2e.mjs [--shots dir]
// Needs .env.local (public keys) and the service role key, fetched via `sb privat projects api-keys` (never printed)
// or from SUPABASE_SERVICE_ROLE_KEY. Spawns a dev server with that key on a free port. Every account it creates is
// removed at the end, even if a check fails. Checks: password re-auth, confirm word, UI texts, teacher warning,
// storage/rows really gone, session cleared, redirect + message, axe AA in light/dark on desktop + mobile.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { createServer } from "node:net";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(readFileSync(join(ROOT, ".env.local"), "utf8").split("\n").filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "")]));
const URL_ = env.NEXT_PUBLIC_SUPABASE_URL, ANON = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const ref = new globalThis.URL(URL_).hostname.split(".")[0];
let SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SERVICE) {
  const out = spawnSync(join(homedir(), "JARVIS/bin/sb"), ["privat", "projects", "api-keys", "--project-ref", ref, "-o", "json"], { encoding: "utf8" });
  SERVICE = JSON.parse(out.stdout).find((k) => k.name === "service_role")?.api_key;
}
if (!SERVICE) { console.error("no service role key available"); process.exit(2); }

const shots = process.argv.includes("--shots") ? process.argv[process.argv.indexOf("--shots") + 1] : "";
if (shots) mkdirSync(shots, { recursive: true });
const pwPath = [process.env.PLAYWRIGHT, join(homedir(), "Projects/bewerbungen-tracker-wt/audit-tools/node_modules/playwright-core/index.mjs")].find((p) => p && existsSync(p));
const { chromium } = await import(pwPath ? pathToFileURL(pwPath).href : "playwright-core");
const chrome = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const AXE = join(ROOT, "node_modules/axe-core/axe.min.js");

const admin = createClient(URL_, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
const stamp = Date.now();
const PASSWORD = `Tmp-${stamp}-Pw!x`;
const created = [];
const mkUser = async (label, role) => {
  const email = `e2e-delete-${label}-${stamp}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { role } });
  if (error) throw error;
  created.push(data.user.id);
  return { id: data.user.id, email };
};
const asUser = async (u) => { const c = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } }); const { error } = await c.auth.signInWithPassword({ email: u.email, password: PASSWORD }); if (error) throw error; return c; };
const exists = async (id) => !(await admin.auth.admin.getUserById(id)).error;
const report = async (id) => (await admin.rpc("account_data_report", { p_user_id: id })).data;

const freePort = () => new Promise((res) => { const s = createServer().listen(0, () => { const { port } = s.address(); s.close(() => res(port)); }); });
const port = await freePort();
const base = `http://localhost:${port}`;
const server = spawn("npx", ["next", "dev", "--webpack", "-p", String(port)], { cwd: ROOT, stdio: "ignore", env: { ...process.env, SUPABASE_SERVICE_ROLE_KEY: SERVICE } });
for (let i = 0; i < 120; i++) { if (await fetch(base).then((r) => r.status < 500, () => false)) break; await new Promise((r) => setTimeout(r, 1000)); }

let failed = 0;
const check = (ok, name, info = "") => { if (!ok) failed++; console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : " — " + info}`); };
const browser = await chromium.launch({ executablePath: chrome, headless: true });

async function seedStudent(u, friend) {
  const c = await asUser(u);
  const day = new Date().toISOString().slice(0, 10);
  const ins = await c.from("applications").insert({ id: `${u.id}-app-1`, user_id: u.id, company: "E2E AG", position: "Test", category: "IT", status: "applied", created_at: day, updated_at: day });
  if (ins.error) throw ins.error;
  const up = await c.storage.from("cvs").upload(`${u.id}/cv1/e2e.txt`, new Blob(["e2e"]), { contentType: "text/plain" });
  if (up.error) throw up.error;
  await c.from("cvs").update({ storage_path: `${u.id}/cv1/e2e.txt`, file_name: "e2e.txt" }).eq("user_id", u.id).limit(1);
  const av = await c.storage.from("avatars").upload(`${u.id}/avatar.png`, new Blob(["x"], { type: "image/png" }), { contentType: "image/png" });
  if (av.error) check(false, "seed avatar", av.error.message);
  const { error } = await admin.from("friendships").insert({ requester_id: u.id, addressee_id: friend.id, status: "accepted" });
  if (error) throw error;
}
const listAll = async (bucket, id) => { const { data } = await admin.storage.from(bucket).list(id, { limit: 100 }); return data ?? []; };

async function login(page, u) {
  await page.goto(`${base}/login`);
  await page.locator("#email").fill(u.email);
  await page.locator("#password").fill(PASSWORD);
  await page.getByRole("button", { name: /^Anmelden$/ }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30000 });
}
async function axeCheck(page, label) {
  await page.addScriptTag({ path: AXE });
  const res = await page.evaluate(async () => { const r = await axe.run(document.body, { runOnly: ["wcag2a", "wcag2aa", "wcag21aa"] }); return r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")}`); });
  check(res.length === 0, `axe AA ${label}`, res.join(" ; "));
}

try {
  const student = await mkUser("student", "student"), friend = await mkUser("friend", "student"), teacher = await mkUser("teacher", "teacher"), keeper = await mkUser("keeper", "student");
  await seedStudent(student, friend);
  await seedStudent(keeper, friend);
  // teacher with a class; the student and the keeper are members
  const tc = await asUser(teacher);
  const cls = await tc.rpc("class_create", { p_name: "E2E 8a", p_school_year: "2026/27" });
  check(!cls.error, "teacher creates a class", cls.error?.message);
  const code = cls.data?.join_code ?? cls.data?.[0]?.join_code;
  for (const u of [student, keeper]) { const c = await asUser(u); const j = await c.rpc("class_join", { p_code: code }); check(!j.error, "student joins the class", j.error?.message); }
  check(Object.keys(await report(student.id)).length >= 5, "seeded rows exist before deleting", JSON.stringify(await report(student.id)));
  check((await listAll("cvs", `${student.id}/cv1`)).length === 1 && (await exists(student.id)), "seeded storage file exists");

  // ---- anonymous / stale API calls ----
  const noToken = await fetch(`${base}/api/account/delete`, { method: "POST", body: "{}" });
  check(noToken.status === 401, "API without token -> 401", String(noToken.status));
  const fake = await fetch(`${base}/api/account/delete`, { method: "POST", headers: { Authorization: "Bearer a.b.c" }, body: JSON.stringify({ confirm: "LÖSCHEN" }) });
  check(fake.status === 401, "API with a forged token -> 401", String(fake.status));
  const c0 = await asUser(student); const tok = (await c0.auth.getSession()).data.session.access_token;
  const wrongWord = await fetch(`${base}/api/account/delete`, { method: "POST", headers: { Authorization: `Bearer ${tok}` }, body: JSON.stringify({ confirm: "nein" }) });
  check(wrongWord.status === 400 && (await exists(student.id)), "API with wrong confirmation -> 400, user still exists", String(wrongWord.status));

  // ---- UI flow, student (desktop + mobile, light + dark screenshots) ----
  for (const [label, opts] of [["desktop", { viewport: { width: 1280, height: 800 } }], ["mobile", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }]]) {
    for (const dark of [false, true]) {
      const ctx = await browser.newContext({ ...opts, colorScheme: dark ? "dark" : "light" });
      await ctx.addInitScript((d) => { try { localStorage.setItem("theme", d ? "dark" : "light"); localStorage.setItem("wendapply-theme", d ? "dark" : "light"); } catch {} }, dark);
      const page = await ctx.newPage();
      await login(page, keeper);
      await page.goto(`${base}/settings`);
      await page.getByRole("button", { name: "Konto löschen…" }).click();
      const dialog = page.getByRole("dialog");
      await dialog.waitFor();
      await page.waitForTimeout(600);
      check(await dialog.getByTestId("delete-items").innerText().then((t) => /Bewerbung/.test(t) && /Dokument/.test(t) && /Profilbild/.test(t) && /Freundschaften/.test(t) && /Klassenmitgliedschaften/.test(t)), `[${label}${dark ? " dark" : ""}] dialog lists what is deleted`);
      const del = dialog.getByRole("button", { name: "Konto endgültig löschen" });
      check(await del.isDisabled(), `[${label}${dark ? " dark" : ""}] delete button disabled initially`);
      if (shots) await page.screenshot({ path: join(shots, `delete-${label}-${dark ? "dark" : "light"}.png`) });
      await axeCheck(page, `dialog ${label}${dark ? " dark" : ""}`);
      await ctx.close();
    }
  }

  // ---- settings page: sections, notification slot, password change (own throwaway user) ----
  const pwUser = await mkUser("pw", "student");
  {
    const sctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const sp = await sctx.newPage();
    await login(sp, pwUser);
    await sp.goto(`${base}/settings`);
    await sp.getByTestId("section-data").waitFor({ timeout: 20000 });
    check(await sp.getByTestId("section-account").isVisible() && await sp.getByRole("heading", { name: "Meine Daten löschen" }).isVisible() && await sp.getByRole("heading", { name: "Konto löschen" }).isVisible(), "settings separates 'Meine Daten löschen' from 'Konto löschen'");
    check(await sp.getByTestId("notification-settings").isVisible(), "notification slot is rendered");
    const card = sp.getByTestId("password-card");
    await card.waitFor({ timeout: 15000 });
    await card.getByLabel("Aktuelles Passwort").fill(PASSWORD);
    await card.getByLabel("Neues Passwort", { exact: true }).fill("kurz");
    await card.getByLabel("Neues Passwort wiederholen").fill("kurz");
    await card.getByRole("button", { name: "Passwort ändern" }).click();
    check(await card.getByRole("alert").getByText(/mindestens 8 Zeichen/).isVisible(), "password change: too-short password rejected in German");
    await card.getByLabel("Aktuelles Passwort").fill("falsch-falsch-1");
    await card.getByLabel("Neues Passwort", { exact: true }).fill(PASSWORD + "2");
    await card.getByLabel("Neues Passwort wiederholen").fill(PASSWORD + "2");
    await card.getByRole("button", { name: "Passwort ändern" }).click();
    await card.getByText("Das aktuelle Passwort stimmt nicht.").waitFor({ timeout: 15000 });
    check(true, "password change: wrong current password rejected");
    await card.getByLabel("Aktuelles Passwort").fill(PASSWORD);
    await card.getByRole("button", { name: "Passwort ändern" }).click();
    await card.getByText("Dein Passwort wurde geändert.").waitFor({ timeout: 15000 });
    const relog = await createClient(URL_, ANON, { auth: { persistSession: false } }).auth.signInWithPassword({ email: pwUser.email, password: PASSWORD + "2" });
    check(!relog.error, "password change: new password works for sign-in", relog.error?.message);
    if (shots) await sp.screenshot({ path: join(shots, "settings-desktop.png"), fullPage: true });
    await axeCheck(sp, "settings page");
    await sctx.close();
  }

  // ---- real deletion: student (password) ----
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await login(page, student);
  await page.goto(`${base}/settings`);
  await page.getByRole("button", { name: "Konto löschen…" }).click();
  const dlg = page.getByRole("dialog");
  const btn = dlg.getByRole("button", { name: "Konto endgültig löschen" });
  await dlg.getByLabel(/Zur Bestätigung/).fill("LÖSCHEN");
  check(await btn.isDisabled(), "confirm word alone is not enough (password missing)");
  await dlg.getByLabel("Dein Passwort").fill("falsch-falsch");
  check(await btn.isEnabled(), "button enabled with word + password");
  await btn.click();
  await dlg.getByText("Das Passwort stimmt nicht.").waitFor({ timeout: 15000 });
  check(await exists(student.id), "wrong password deletes nothing");
  await dlg.getByLabel("Dein Passwort").fill(PASSWORD);
  await dlg.getByLabel(/Zur Bestätigung/).fill("löschen");
  await btn.click();
  await page.waitForURL(/\/login/, { timeout: 60000 });
  await page.getByText("Dein Konto und alle deine Daten wurden gelöscht").waitFor({ timeout: 15000 });
  check(true, "redirected to /login with confirmation message");
  if (shots) await page.screenshot({ path: join(shots, "deleted-login.png") });
  check(!(await exists(student.id)), "auth user is gone");
  check(JSON.stringify(await report(student.id)) === "{}", "no rows left for the student", JSON.stringify(await report(student.id)));
  check((await listAll("cvs", student.id)).length === 0 && (await listAll("cvs", `${student.id}/cv1`)).length === 0 && (await listAll("avatars", student.id)).length === 0, "storage objects are gone");
  check((await admin.from("applications").select("id").eq("user_id", student.id)).data?.length === 0, "applications gone");
  check((await admin.from("friendships").select("id").or(`requester_id.eq.${student.id},addressee_id.eq.${student.id}`)).data?.length === 0, "friend link gone");
  check((await admin.from("class_members").select("student_id").eq("student_id", student.id)).data?.length === 0, "class membership gone");
  check(await exists(friend.id) && await exists(keeper.id) && await exists(teacher.id), "other accounts untouched");
  check((await admin.from("applications").select("id").eq("user_id", keeper.id)).data?.length === 1, "other student's data untouched");
  check((await admin.from("class_members").select("student_id").eq("student_id", keeper.id)).data?.length === 1, "other student still in the class");
  check(await page.evaluate(() => !Object.keys(localStorage).some((k) => k.startsWith("sb-") && localStorage.getItem(k)?.includes("access_token"))), "browser session cleared");
  await page.goto(`${base}/settings`);
  await page.waitForURL(/\/login/, { timeout: 15000 });
  check(true, "protected page redirects to login after deletion");
  const old = await createClient(URL_, ANON).auth.signInWithPassword({ email: student.email, password: PASSWORD });
  check(!!old.error, "deleted account cannot sign in anymore");
  await ctx.close();

  // ---- real deletion: teacher (class warning, students keep their data) ----
  const tctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const tpage = await tctx.newPage();
  await login(tpage, teacher);
  await tpage.goto(`${base}/settings`);
  await tpage.getByRole("button", { name: "Konto löschen…" }).click();
  const td = tpage.getByRole("dialog");
  await td.getByText(/Du leitest deine Klasse/).waitFor({ timeout: 15000 });
  check(true, "teacher sees the class warning");
  await tpage.waitForTimeout(900);
  if (shots) await tpage.screenshot({ path: join(shots, "delete-teacher-mobile.png") });
  await td.getByLabel(/Zur Bestätigung/).fill(teacher.email);
  await td.getByLabel("Dein Passwort").fill(PASSWORD);
  await td.getByRole("button", { name: "Konto endgültig löschen" }).click();
  await tpage.waitForURL(/\/login/, { timeout: 60000 });
  check(!(await exists(teacher.id)) && JSON.stringify(await report(teacher.id)) === "{}", "teacher account and rows gone", JSON.stringify(await report(teacher.id)));
  check((await admin.from("classes").select("id").eq("teacher_id", teacher.id)).data?.length === 0, "teacher's class gone");
  check((await admin.from("class_members").select("student_id").eq("student_id", keeper.id)).data?.length === 0, "students removed from the deleted class");
  check((await admin.from("applications").select("id").eq("user_id", keeper.id)).data?.length === 1, "student keeps their applications");
  await tctx.close();
} catch (error) {
  failed++;
  console.log("FAIL unexpected error —", error?.message ?? error);
} finally {
  await browser.close().catch(() => {});
  server.kill("SIGTERM");
  let leftovers = 0;
  for (const id of created) { if (await exists(id)) { leftovers++; for (const b of ["cvs", "avatars"]) { const files = await listAll(b, id); const sub = await listAll(b, `${id}/cv1`); const rm = [...files.filter((f) => f.id).map((f) => `${id}/${f.name}`), ...sub.map((f) => `${id}/cv1/${f.name}`)]; if (rm.length) await admin.storage.from(b).remove(rm); } await admin.auth.admin.deleteUser(id); } }
  console.log(`cleanup: ${created.length} throwaway accounts created, ${leftovers} had to be removed by the cleanup`);
  console.log(failed ? `\n${failed} FAILED` : "\nALL PASSED");
  process.exit(failed ? 1 : 0);
}
