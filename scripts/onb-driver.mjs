// Funnel driver shared by scripts/onb-e2e.mjs (stubbed Supabase) and scripts/onb-smoke-prod.mjs (live). Selectors follow
// SPEC-FLOW: step slugs in ?schritt=, the copy of every screen (labels, tile texts, button labels). No module state.
import { FUNNEL_KEY, PATHS, ROLE_LABEL } from "./onb-lib.mjs";

export const YEAR = new Date().getFullYear();
export const PW = "Sicher-Passwort-2026";
export const slugOf = (page) => { const u = new URL(page.url()); return u.pathname === "/start" ? (u.searchParams.get("schritt") || "weg") : u.pathname; };
export const waitSlug = (page, slug, timeout = 15000) => page.waitForFunction((s) => { const u = new URL(location.href); return (u.pathname === "/start" ? (u.searchParams.get("schritt") || "weg") : u.pathname) === s; }, slug, { timeout }).then(() => true, () => false);
export const waitPath = (page, re, timeout = 30000) => page.waitForURL((u) => re.test(u.pathname + u.search), { timeout }).then(() => true, () => false);
export const h1 = (page) => page.locator("h1").first().innerText({ timeout: 8000 }).catch(() => "");
export const vis = (loc, timeout = 8000) => loc.first().waitFor({ state: "visible", timeout }).then(() => true, () => false);
export const ls = (page, key) => page.evaluate((k) => { try { return localStorage.getItem(k); } catch { return null; } }, key);
export const funnelState = async (page) => { try { return JSON.parse((await ls(page, FUNNEL_KEY)) || "null"); } catch { return null; } };
export const primary = (page) => page.getByRole("button", { name: /^(Weiter|Konto erstellen|Plan speichern|Los geht)/ }).last();
export const tile = (page, text) => page.locator("label, [role=radio], [role=checkbox], button").filter({ hasText: text }).first();

/** Clicks the primary action of `from` unless the page already moved on (role tiles auto-advance after 250 ms). */
export async function advance(page, from) {
  await page.waitForTimeout(450);
  if (slugOf(page) === from) await primary(page).click();
  const moved = await page.waitForFunction((s) => { const u = new URL(location.href); return (u.searchParams.get("schritt") || (u.pathname === "/start" ? "weg" : u.pathname)) !== s; }, from, { timeout: 10000 }).then(() => true, () => false);
  if (!moved) throw new Error(`stuck on «${from}» (h1 «${await h1(page)}»)`);
  return slugOf(page);
}
/** Default answers per role. Override fields to vary a run. */
export const ANSWERS = {
  student: { firstName: "Lena", birthYear: YEAR - 14, schoolLevel: "8. Klasse", canton: "ZH", place: "", profession: "Informatiker:in", weeklyGoal: 4, help: ["Lebenslauf schreiben"], family: "Später", classCode: "" },
  parent: { firstName: "Sandra", begleiten: ["Überblick, wo mein Kind steht"], kid: "Später" },
  staff: { zugang: "Meine Schule hat schon eine Lizenz" },
};
/** Fills the current step. Returns nothing; throws with a readable message when an expected control is missing. */
export async function answer(page, slug, role, a) {
  switch (slug) {
    case "weg": await page.getByRole("button", { name: /Los geht/ }).or(page.getByRole("link", { name: /Los geht/ })).first().click(); return "clicked";
    case "rolle": await tile(page, ROLE_LABEL[role]).click(); return;
    case "name": await page.getByLabel("Vorname").fill(a.firstName); return;
    case "jahrgang": {
      const chip = page.getByRole("radio", { name: String(a.birthYear), exact: true });
      if (await chip.count()) await tile(page, String(a.birthYear)).click(); else { await tile(page, "Anderes Jahr").click(); await page.locator("select").last().selectOption(String(a.birthYear)); }
      return;
    }
    case "schule":
      await tile(page, a.schoolLevel).click();
      if (a.classCode) { await page.getByText(/Ich habe einen Klassencode/).first().click(); await page.locator("#funnel-class-code").fill(a.classCode); }
      return;
    case "ort": {
      const sel = page.getByLabel("Kanton");
      await sel.selectOption(a.canton).catch(async () => sel.selectOption({ label: "Zürich" }));
      if (a.place) await page.getByLabel(/Ort oder PLZ/).fill(a.place);
      return;
    }
    case "beruf": if (a.profession === "unsure") await tile(page, "Weiss ich noch nicht").click(); else await tile(page, a.profession).click(); return;
    case "wochenziel": if (a.weeklyGoal !== 3) await tile(page, String(a.weeklyGoal)).click(); return;
    case "hilfe": for (const h of a.help) await tile(page, h).click(); return;
    case "dabei": await tile(page, a.family).click(); return;
    case "begleiten": for (const h of a.begleiten) await tile(page, h).click(); return;
    case "kind": await tile(page, a.kid).click(); return;
    case "zugang": await tile(page, a.zugang).click(); return;
    default: return;
  }
}
/** Walks from the current step to `until` (exclusive), answering each step. Returns the visited slugs. */
export async function walk(page, role, a, until = "konto") {
  const seen = [];
  for (let i = 0; i < 20; i++) {
    const s = slugOf(page);
    seen.push(s);
    if (s === until || !s || !PATHS[role].includes(s)) break;
    await page.locator("h1").first().waitFor({ timeout: 15000 });
    const clicked = await answer(page, s, role, a);
    if (clicked === "clicked") await page.waitForFunction(() => new URL(location.href).searchParams.get("schritt"), null, { timeout: 10000 }).catch(() => {});
    else await advance(page, s);
  }
  return seen;
}
export async function fillKonto(page, email, { consent = true, submit = true, password = PW } = {}) {
  await page.getByLabel(/E-Mail-Adresse/).first().fill(email);
  await page.getByLabel(/^Passwort$/).first().fill(password);
  if (consent) await page.getByRole("checkbox", { name: /Datenschutz/ }).first().check({ force: true });
  if (submit) await page.getByRole("button", { name: /^Konto erstellen/ }).last().click();
}
