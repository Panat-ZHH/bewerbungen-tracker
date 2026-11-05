// End-to-end UX flows against the stub (nothing real is touched). Prints PASS/FAIL, writes screenshots.
// PLAYWRIGHT=... CHROME=... node scripts/ux-v2-flows.mjs [--shots subdir/]
import fs from "node:fs";
import { BASE, SHOTS, installStub, launch, newCtx } from "./ux-v2-stub.mjs";
const sub = process.argv.includes("--shots") ? process.argv[process.argv.indexOf("--shots") + 1] : "flows/";
const OUT = SHOTS + sub; fs.mkdirSync(OUT, { recursive: true });
let fails = 0;
const check = (ok, text) => { console.log(ok ? "PASS" : "FAIL", text); if (!ok) fails++; };
const browser = await launch();
async function session(opts = {}, vp = {}) {
  const ctx = await newCtx(browser, vp);
  const state = await installStub(ctx, opts);
  const page = await ctx.newPage(); const errors = [];
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text().slice(0, 200)); });
  page.on("pageerror", (e) => errors.push("pageerror " + e.message.slice(0, 200)));
  return { ctx, state, page, errors };
}
const shot = (page, name) => page.screenshot({ path: `${OUT}${name}.png`, fullPage: true });
// every scenario runs isolated so one failure does not hide the others
async function scenario(name, fn) { try { await fn(); } catch (e) { check(false, `${name}: threw ${String(e.message).split("\n")[0]}`); } }

await scenario("first-run", async () => {
  for (const [w, h, dark] of [[375, 812, false], [375, 812, true], [1280, 800, false]]) {
    const { ctx, page } = await session({ apps: [], social: "empty" }, { w, h, dark });
    await page.goto(BASE + "/dashboard"); await page.getByRole("heading", { name: /Willkommen/ }).waitFor();
    const cta = page.getByRole("link", { name: /Erste Bewerbung eintragen/ });
    check(await cta.isVisible(), `first-run ${w}${dark ? " dark" : ""}: CTA visible`);
    const color = await cta.evaluate((el) => getComputedStyle(el).color);
    check(color === "rgb(255, 255, 255)", `first-run ${w}${dark ? " dark" : ""}: CTA text is white (${color})`);
    await shot(page, `01-first-run-${w}${dark ? "-dark" : ""}`); await ctx.close();
  }
});

await scenario("add", async () => {
  const { ctx, page, state, errors } = await session({}, { w: 375, h: 812 });
  await page.goto(BASE + "/applications/new");
  await page.getByRole("button", { name: "Bewerbung speichern" }).click();
  await page.getByText(/Bitte gib die Firma an/).waitFor();
  await page.waitForTimeout(100);
  check(await page.evaluate(() => document.activeElement?.getAttribute("aria-invalid") === "true"), "validation: focus moved to first invalid field");
  check(await page.getByRole("alert").first().isVisible(), "validation: summary alert visible");
  await shot(page, "02-validation-375");
  await page.getByLabel(/^Firma/).fill("Novartis"); await page.getByLabel(/^Welche Stelle/).fill("Laborant:in EFZ");
  await page.getByLabel("Was ist der Stand?").selectOption("applied");
  check(await page.getByText("Deine Unterlagen sind unterwegs.").isVisible(), "form: status hint shown");
  await page.getByRole("button", { name: "Bewerbung speichern" }).click();
  await page.waitForURL(/\/applications\/(?!new)/);
  await page.getByText(/Bewerbung gespeichert/).waitFor();
  check(true, "save: toast after create"); check(state.apps.some((a) => a.company === "Novartis"), "save: stub received row");
  await shot(page, "03-after-create-375"); check(errors.length === 0, "add flow: no console errors " + errors.join("|")); await ctx.close();
});

await scenario("save-error", async () => {
  const { ctx, page } = await session({ failWrites: 500 }, { w: 375, h: 812 });
  await page.goto(BASE + "/applications/new");
  await page.getByLabel(/^Firma/).fill("X AG"); await page.getByLabel(/^Welche Stelle/).fill("Y");
  await page.getByRole("button", { name: "Bewerbung speichern" }).click();
  const alert = page.getByRole("alert").filter({ hasText: /gespeichert/ }); await alert.waitFor();
  const text = await alert.innerText();
  check(!/Database|relation|XX000|exploded|secret/i.test(text), `error: no raw DB text -> "${text.replace(/\n/g, " ")}"`);
  await shot(page, "04-save-error-375"); await ctx.close();
});

await scenario("status-delete", async () => {
  const { ctx, page, state } = await session({}, { w: 375, h: 812 });
  await page.goto(BASE + "/applications/a2"); await page.getByRole("heading", { name: "Praktikum Finanzen" }).waitFor();
  await page.getByLabel("Stand der Bewerbung").selectOption("interview");
  await page.getByText("Stand geändert: Gespräch").waitFor(); check(true, "status: toast shown");
  await shot(page, "05-status-toast-375");
  await page.getByRole("button", { name: "Rückgängig" }).click();
  await page.getByText(/Wieder auf/).waitFor(); check(state.apps.find((a) => a.id === "a2").status === "applied", "status: undo restores previous status");
  await page.getByRole("button", { name: "Bewerbung löschen" }).click();
  check(await page.getByRole("dialog", { name: "Bewerbung löschen?" }).isVisible(), "delete: confirm dialog");
  await shot(page, "06-delete-dialog-375");
  await page.getByRole("button", { name: "Löschen", exact: true }).click();
  await page.waitForURL(/\/applications$/); await page.getByText(/gelöscht/).first().waitFor();
  check(!state.apps.some((a) => a.id === "a2"), "delete: removed in stub"); await shot(page, "07-delete-toast-375");
  await page.getByRole("button", { name: "Rückgängig" }).click();
  await page.waitForURL(/\/applications\/a2/); check(state.apps.some((a) => a.id === "a2"), "delete: undo restored the row"); await ctx.close();
});

await scenario("login", async () => {
  const { ctx, page } = await session({ authed: false, authError: "Invalid login credentials" }, { w: 375, h: 812 });
  await page.goto(BASE + "/login");
  await page.getByRole("button", { name: "Passwort vergessen?" }).click();
  await page.getByText(/Trag oben deine E-Mail/).waitFor(); check(true, "login: forgot password without email -> hint");
  await page.getByLabel("E-Mail-Adresse").fill("a@b.ch"); await page.getByLabel("Passwort", { exact: true }).fill("falsch1");
  await page.getByRole("button", { name: "Anmelden", exact: true }).click(); await page.getByText(/E-Mail oder Passwort stimmt nicht/).waitFor(); check(true, "login: wrong credentials message");
  await shot(page, "08-login-error-375");
  await page.getByRole("button", { name: "Passwort vergessen?" }).click(); await page.getByText(/Link zum Zurücksetzen geschickt/).waitFor(); check(true, "login: reset mail confirmation");
  await page.getByRole("button", { name: "Passwort anzeigen" }).click(); check(await page.locator("#password").getAttribute("type") === "text", "login: show password toggle");
  await ctx.close();
});

await scenario("keyboard", async () => {
  const { ctx, page } = await session({}, { w: 1280, h: 800 });
  await page.goto(BASE + "/dashboard"); await page.getByRole("heading", { name: /Deine Suche/ }).waitFor();
  await page.keyboard.press("Tab");
  check(await page.evaluate(() => document.activeElement?.textContent?.includes("Zum Inhalt springen")), "keyboard: first Tab = skip link");
  for (let i = 0; i < 12; i++) await page.keyboard.press("Tab");
  const outline = await page.evaluate(() => { const cs = getComputedStyle(document.activeElement); return `${cs.outlineStyle} ${cs.outlineWidth}`; });
  check(/solid 3px/.test(outline), `keyboard: focus ring visible (${outline})`);
  await shot(page, "09-focus-1280"); await ctx.close();
});

await scenario("reduced-motion", async () => {
  const { ctx, page } = await session({}, { w: 375, h: 812, reducedMotion: "reduce" });
  await page.goto(BASE + "/dashboard"); await page.getByRole("heading", { name: /Deine Suche/ }).waitFor();
  const d = await page.evaluate(() => { const el = document.querySelector(".skeleton, .animate-rise, .glass-surface"); return el ? getComputedStyle(el).animationDuration : "n/a"; });
  check(d === "n/a" || parseFloat(d) < 0.01, `reduced motion: animation duration ${d}`); await ctx.close();
});

await scenario("friends", async () => {
  const { ctx, page } = await session({ rpc: { social_send_request: { __error: "USER_NOT_FOUND" } } }, { w: 375, h: 812 });
  await page.goto(BASE + "/friends"); await page.getByLabel("Code oder E-Mail").fill("nobody"); await page.getByRole("button", { name: "Anfrage senden" }).click();
  await page.getByText(/niemanden gefunden/).waitFor(); check(true, "friends: unknown code -> friendly");
  await shot(page, "10-friends-375"); await ctx.close();
});
await scenario("classes", async () => {
  const { ctx, page } = await session({ social: "empty", rpc: { class_preview: { __error: "CLASS_NOT_FOUND" } } }, { w: 375, h: 812 });
  await page.goto(BASE + "/classes"); await page.getByLabel("Klassencode").fill("zzz"); await page.getByRole("button", { name: /Weiter|Klasse/ }).click();
  await page.getByText(/Klassencode gibt es nicht/).waitFor(); check(true, "classes: wrong code -> friendly"); await shot(page, "11-classes-student-375"); await ctx.close();
});
await scenario("settings", async () => {
  const { ctx, page } = await session({}, { w: 375, h: 812 });
  let native = false; page.on("dialog", (d) => { native = true; d.dismiss(); });
  await page.goto(BASE + "/settings"); await page.getByRole("button", { name: "Meine Daten löschen" }).click();
  await page.waitForTimeout(500);
  check(!native, "settings: no native confirm()"); check(await page.getByRole("dialog").isVisible().catch(() => false), "settings: styled confirm dialog");
  await shot(page, "12-settings-confirm-375"); await ctx.close();
});
await scenario("404", async () => {
  const { ctx, page } = await session({ authed: false }, { w: 375, h: 812 });
  await page.goto(BASE + "/nope"); check(await page.getByRole("heading", { name: /gibt es nicht/ }).isVisible(), "404 page"); await shot(page, "13-404-375"); await ctx.close();
});
await browser.close();
console.log(fails ? `${fails} FAILED` : "ALL PASSED"); process.exit(fails ? 1 : 0);
