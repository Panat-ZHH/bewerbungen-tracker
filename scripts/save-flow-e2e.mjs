// Save-flow E2E: can an application be saved at ANY intermediate state (partial form, every status, cleared fields,
// drafts, reload)? Runs against the REAL Supabase project with ONE throwaway account (created + deleted here).
//   node scripts/save-flow-e2e.mjs                       # spawns a local dev server
//   BASE=https://wendapply.ch node scripts/save-flow-e2e.mjs --keep   # against production; --keep leaves the account so the
//                                                          # caller can delete it through the UI ("Konto löschen") afterwards
// Needs .env.local (public keys) and the service role key via `sb privat projects api-keys` (never printed).
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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

const keep = process.argv.includes("--keep");
const shotsDir = process.argv.includes("--shots") ? process.argv[process.argv.indexOf("--shots") + 1] : "";
if (shotsDir) mkdirSync(shotsDir, { recursive: true });
const pwPath = [process.env.PLAYWRIGHT, join(homedir(), "Projects/bewerbungen-tracker-wt/audit-tools/node_modules/playwright-core/index.mjs")].find((p) => p && existsSync(p));
const { chromium } = await import(pwPath ? pathToFileURL(pwPath).href : "playwright-core");
const chrome = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const admin = createClient(URL_, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
const stamp = Date.now();
const PASSWORD = `Tmp-${stamp}-Pw!x`;
const email = `e2e-save-${stamp}@example.com`;
const { data: made, error: mkErr } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { role: "student" } });
if (mkErr) { console.error(mkErr.message); process.exit(2); }
const userId = made.user.id;
if (keep) writeFileSync("/tmp/save-flow-account.json", JSON.stringify({ email, password: PASSWORD, userId }), { mode: 0o600 });

let base = process.env.BASE, server;
if (!base) {
  const port = await new Promise((res) => { const s = createServer().listen(0, () => { const { port } = s.address(); s.close(() => res(port)); }); });
  base = `http://localhost:${port}`;
  server = spawn("npx", ["next", "dev", "--webpack", "-p", String(port)], { cwd: ROOT, stdio: "ignore", env: { ...process.env, SUPABASE_SERVICE_ROLE_KEY: SERVICE } });
  for (let i = 0; i < 120; i++) { if (await fetch(base).then((r) => r.status < 500, () => false)) break; await new Promise((r) => setTimeout(r, 1000)); }
}

let failed = 0;
const check = (ok, name, info = "") => { if (!ok) failed++; console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok ? "" : " — " + info}`); };
const row = async (id) => (await admin.from("applications").select("*").eq("id", id).maybeSingle()).data;
const rows = async () => (await admin.from("applications").select("*").eq("user_id", userId)).data ?? [];
const browser = await chromium.launch({ executablePath: chrome, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const errorsSeen = [];
page.on("pageerror", (e) => errorsSeen.push(e.message));
let beforeUnloadDialogs = 0;
page.on("dialog", (d) => { if (d.type() === "beforeunload") beforeUnloadDialogs++; d.accept().catch(() => {}); });
const shot = async (name) => { if (shotsDir) await page.screenshot({ path: join(shotsDir, `${name}.png`) }); };
const idFromUrl = () => decodeURIComponent(new globalThis.URL(page.url()).pathname.split("/").pop());
const openMore = async () => { const d = page.locator("details").first(); if (!(await d.evaluate((el) => el.open))) await d.locator("summary").click(); };
const hasValue = async (label, value) => { for (let i = 0; i < 30; i++) { if ((await page.getByLabel(label).inputValue().catch(() => null)) === value) return true; await page.waitForTimeout(250); } return false; };
const waitSaved = () => page.waitForURL((u) => /\/applications\/[^/]+$/.test(u.pathname) && !u.pathname.endsWith("/new"), { timeout: 20000 });

try {
  await page.goto(`${base}/login`);
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(PASSWORD);
  await page.getByRole("button", { name: /^Anmelden$/ }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 });
  // the student onboarding may redirect; skip it by going straight to the page under test
  await page.goto(`${base}/applications/new`);

  // ---- 1. minimal save: only Firma + Stelle ----
  await page.getByLabel(/^Firma/).waitFor();
  await page.waitForTimeout(1500); // let React hydrate so the typed value is not reset
  await page.getByLabel(/^Firma/).fill("Draft AG");
  await page.getByLabel(/^Welche Stelle/).fill("Polymechaniker:in");
  await page.getByRole("button", { name: "Bewerbung speichern" }).click();
  await waitSaved();
  const id = idFromUrl();
  check((await row(id))?.company === "Draft AG", "1 minimal application (Firma + Stelle) is stored");
  await page.reload();
  await page.getByRole("heading", { name: "Draft AG" }).waitFor({ timeout: 15000 }).catch(() => {});
  check(await page.getByRole("heading", { name: "Draft AG" }).isVisible(), "1 detail page survives a reload");

  // ---- 2. edit: fill every optional field and save ----
  const edit = async () => { await page.getByRole("button", { name: "Bearbeiten" }).click(); await page.getByLabel(/^Firma/).waitFor(); await openMore(); };
  const save = async () => { await page.getByRole("button", { name: "Änderungen speichern" }).click(); await page.waitForFunction(() => !document.body.innerText.includes("Speichert …"), null, { timeout: 20000 }); };
  await edit();
  await page.getByLabel(/^Ort/).fill("Winterthur");
  await page.getByLabel(/^Link zur Stelle/).fill("https://example.com/lehrstelle");
  await page.getByLabel(/^Wo hast du/).fill("jobs.ch");
  await page.getByLabel(/^Ansprechperson/).fill("Frau Meier");
  await page.getByLabel(/^E-Mail oder Telefon/).fill("meier@example.com");
  await page.getByLabel(/^Deine Notizen/).fill("Erste Notiz");
  await page.getByLabel(/^Was ist in der Stellenanzeige/).fill("Beschreibung der Stelle");
  await save();
  await waitSaved();
  let r = await row(id);
  check(r?.location === "Winterthur" && r?.job_url === "https://example.com/lehrstelle" && r?.source === "jobs.ch" && r?.contact_name === "Frau Meier" && r?.contact_info === "meier@example.com" && r?.notes === "Erste Notiz" && r?.job_description === "Beschreibung der Stelle", "2 all optional fields are stored", JSON.stringify(r));

  // ---- 3. clearing fields must persist (the cleared value must really become empty) ----
  await edit();
  for (const label of [/^Ort/, /^Link zur Stelle/, /^Wo hast du/, /^Ansprechperson/, /^E-Mail oder Telefon/, /^Deine Notizen/, /^Was ist in der Stellenanzeige/]) await page.getByLabel(label).fill("");
  await save();
  await waitSaved();
  r = await row(id);
  check(!r?.location && !r?.job_url && !r?.source && !r?.contact_name && !r?.contact_info && !r?.notes && !r?.job_description, "3 cleared fields are really cleared in the database", JSON.stringify({ l: r?.location, u: r?.job_url, s: r?.source, c: r?.contact_name, i: r?.contact_info, n: r?.notes, d: r?.job_description }));
  await page.reload();
  check(!(await page.getByText("Erste Notiz").count()), "3 cleared notes do not come back after a reload");

  // ---- 4. every status via the form select, then via the pills ----
  const STATUSES = ["saved", "preparing", "applied", "schnupper_planned", "schnupper_done", "aptitude_test", "interview", "final_interview", "offer", "contract_signed", "rejected", "withdrawn"];
  for (const status of STATUSES) {
    await edit();
    await page.getByLabel(/^Was ist der Stand/).selectOption(status);
    if (status === "schnupper_planned" || status === "schnupper_done") { await page.getByLabel(/^Schnupperdatum/).fill("2026-12-01"); await page.getByLabel(/^Notizen zum Schnuppern/).fill("Sehr nett"); }
    if (status === "schnupper_done") await page.getByLabel(/^Wie war es/).selectOption("positive");
    if (status === "aptitude_test") { await page.getByLabel(/^Testdatum/).fill("2026-12-10"); await page.getByLabel(/^Ergebnis/).selectOption("passed"); }
    await save();
    await waitSaved();
    r = await row(id);
    check(r?.status === status, `4 form: status '${status}' stored`, r?.status);
    if (status === "schnupper_done") check(r?.schnupper_result === "positive" && r?.schnupper_date === "2026-12-01" && r?.schnupper_notes === "Sehr nett", "4 schnupper fields stored", JSON.stringify(r));
    if (status === "aptitude_test") check(r?.test_result === "passed" && r?.test_date === "2026-12-10", "4 test fields stored", JSON.stringify(r));
  }
  for (const [status, label] of [["applied", "Abgeschickt"], ["schnupper_planned", "Schnupperlehre geplant"], ["aptitude_test", "Eignungstest / Multicheck"], ["contract_signed", "Vertrag unterschrieben"], ["rejected", "Absage erhalten"], ["saved", "Gemerkt"]]) {
    await page.getByRole("radio", { name: label, exact: true }).click();
    for (let i = 0; i < 40 && (await row(id))?.status !== status; i++) await page.waitForTimeout(250); // an older toast may still be on screen, so poll the database
    check((await row(id))?.status === status, `4 pills: status '${status}' stored`, (await row(id))?.status);
  }
  await page.reload();
  await page.getByRole("radio", { name: "Gemerkt", exact: true }).waitFor({ timeout: 15000 });
  check(await page.getByRole("radio", { name: "Gemerkt", exact: true, checked: true }).count() === 1, "4 status survives a reload");

  // ---- 5. a partial NEW form is kept as a draft when the user leaves and comes back ----
  await page.goto(`${base}/applications/new`);
  await page.getByLabel(/^Firma/).waitFor();
  await page.waitForTimeout(1500); // hydration
  await page.getByLabel(/^Firma/).fill("Halbfertig GmbH");
  await openMore();
  await page.getByLabel(/^Deine Notizen/).fill("Noch nicht fertig");
  await page.waitForTimeout(1200);
  await shot("draft-typing");
  await page.goto(`${base}/dashboard`);
  await page.goto(`${base}/applications/new`);
  check(await hasValue(/^Firma/, "Halbfertig GmbH"), "5 draft: Firma restored after leaving the page");
  check(await page.getByText(/Entwurf wiederhergestellt/).count() > 0, "5 draft: user is told the draft was restored");
  await shot("draft-restored");
  await page.reload();
  check(await hasValue(/^Firma/, "Halbfertig GmbH"), "5 draft: survives a reload");
  // incomplete: Stelle missing -> clear German message, nothing stored, draft still there
  const before = (await rows()).length;
  await page.getByRole("button", { name: "Bewerbung speichern" }).click();
  check(await page.getByText(/Bitte gib die Stelle an/).first().isVisible(), "5 draft: incomplete save shows a clear German message");
  check((await rows()).length === before, "5 draft: incomplete save stores nothing");
  await page.getByLabel(/^Welche Stelle/).fill("Koch/Köchin");
  await page.getByRole("button", { name: "Bewerbung speichern" }).click();
  await waitSaved();
  check((await rows()).some((x) => x.company === "Halbfertig GmbH" && x.notes === "Noch nicht fertig"), "5 draft: completed form is stored");
  await page.goto(`${base}/applications/new`);
  check((await page.getByLabel(/^Firma/).inputValue()) === "", "5 draft: draft is cleared after a successful save");

  // ---- 6. edit form: 'Zwischenstand speichern' stores without leaving the form ----
  await page.goto(`${base}/applications/${encodeURIComponent(id)}`);
  await edit();
  await page.getByLabel(/^Deine Notizen/).fill("Zwischenstand-Notiz");
  await page.getByRole("button", { name: "Zwischenstand speichern" }).click();
  await page.getByText("Zwischenstand gespeichert").first().waitFor({ timeout: 15000 });
  check((await row(id))?.notes === "Zwischenstand-Notiz", "6 'Zwischenstand speichern' stores the note");
  check(/applications\/[^/]+$/.test(page.url()) && await page.getByLabel(/^Firma/).isVisible(), "6 stays in the form after saving an intermediate state");

  // ---- 7. edit form: unsaved changes survive leaving (local draft) ----
  await page.waitForTimeout(800);
  await page.getByLabel(/^Ort/).fill("Basel");
  await page.waitForTimeout(1200);
  await page.goto(`${base}/dashboard`);
  await page.goto(`${base}/applications/${encodeURIComponent(id)}`);
  await edit();
  await shot("edit-draft");
  check(await hasValue(/^Ort/, "Basel"), "7 edit draft: unsaved change restored");
  check(beforeUnloadDialogs >= 1, "7 leaving with unsaved changes asks for confirmation (beforeunload)");

  check(errorsSeen.length === 0, "no uncaught page errors", errorsSeen.join(" | "));
} catch (error) {
  failed++;
  console.log("FAIL crashed —", error.message.split("\n")[0]);
  await shot("crash").catch(() => {});
} finally {
  await browser.close().catch(() => {});
  if (!keep) {
    const del = await admin.auth.admin.deleteUser(userId);
    console.log(del.error ? `WARN could not delete throwaway user: ${del.error.message}` : "throwaway user deleted");
  } else console.log("throwaway user kept (--keep); credentials in /tmp/save-flow-account.json");
  server?.kill();
  console.log(failed ? `\n${failed} FAILED` : "\nALL PASSED");
  process.exit(failed ? 1 : 0);
}
