// Public website: two separate entries everywhere (SPEC-FLOW §5, DECISIONS #4) – «Kostenlos testen» -> /start, «Anmelden» -> /login.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SIGNUP_HREF, LOGIN_HREF, SIGNUP_LABEL, LOGIN_LABEL, withNext } from "../components/public/auth-links.ts";

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

test("constants: signup opens the funnel, login stays plain", () => {
  assert.equal(SIGNUP_HREF, "/start");
  assert.equal(LOGIN_HREF, "/login");
  assert.equal(SIGNUP_LABEL, "Kostenlos testen");
  assert.equal(LOGIN_LABEL, "Anmelden");
  assert.equal(withNext(SIGNUP_HREF, "/abo"), "/start?next=%2Fabo");
  assert.equal(withNext(LOGIN_HREF, "/abo"), "/login?next=%2Fabo");
});

test("marketing.ts re-exports the entry constants", () => {
  assert.match(read("components/public/marketing.ts"), /export \{ SIGNUP_HREF, LOGIN_HREF, SIGNUP_LABEL, LOGIN_LABEL, withNext \} from "\.\/auth-links\.ts"/);
});

const PLACES = {
  "components/public/public-shell.tsx": ["header-login", "header-login-mobile", "header-signup"],
  "components/public/mobile-menu.tsx": ["menu-signup", "menu-login"],
  "app/page.tsx": ["hero-signup", "hero-login", "cta-signup", "cta-login"],
  "app/anleitung/page.tsx": ["hero-signup", "hero-login", "cta-signup", "cta-login"],
  "app/preise/page.tsx": ["preise-solo-signup", "preise-solo-login"],
};

test("every public entry place has both a signup and a login link", () => {
  for (const [file, ids] of Object.entries(PLACES)) {
    const s = read(file);
    for (const id of ids) assert.ok(s.includes(`data-testid="${id}"`), `${file}: ${id}`);
    assert.ok(s.includes("SIGNUP_HREF") && s.includes("LOGIN_HREF"), `${file} uses both constants`);
  }
});

test("no combined or forbidden CTA labels left on the public site", () => {
  const files = [...Object.keys(PLACES), "app/hilfe/page.tsx", "app/familien/page.tsx", "components/public/cta-band.tsx", "components/guide/content.tsx"];
  for (const f of files) {
    const s = read(f);
    for (const bad of [">Loslegen<", ">App öffnen<", ">Gratis testen<", "Registrieren", "mode=signup"]) assert.ok(!s.includes(bad), `${f}: ${bad}`);
    // A «Kostenlos testen» link must never point at /login.
    assert.ok(!/href="\/login[^"]*"[^>]*>\s*Kostenlos testen/.test(s), `${f}: Kostenlos testen -> /login`);
  }
});

test("Hilfe FAQ «Wie starte ich?» names both entries", () => {
  const s = read("app/hilfe/page.tsx");
  const line = s.split("\n").find((l) => l.includes("Wie starte ich?"));
  assert.ok(line.includes("SIGNUP_HREF") && line.includes("LOGIN_HREF"));
});

test("Datenschutzerklärung lists the onboarding data points", () => {
  const s = read("docs/legal/datenschutzerklaerung.md");
  for (const w of ["Geburtsjahr", "Wochenziel", "Hilfe-Wünsche", "Tour", "Wunschberuf"]) assert.ok(s.includes(w), w);
});
