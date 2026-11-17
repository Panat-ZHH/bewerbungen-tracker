import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { PACKAGES, PILOT, TAGLINE, BRAND_TAGLINE, POSITIONING, CONTACT_EMAIL, chf, perStudentMonth, perStudentYear, MAIL } from "../components/public/marketing.ts";
import manifest from "../app/manifest.ts";
import sitemap from "../app/sitemap.ts";
import robots from "../app/robots.ts";

const root = new URL("../", import.meta.url);
const read = (p) => readFileSync(new URL(p, root), "utf8");

const SITE_FILES = [
  "app/page.tsx", "app/schulen/page.tsx", "app/preise/page.tsx", "app/pilot/page.tsx", "app/datenschutz-uebersicht/page.tsx",
  "app/hilfe/page.tsx", "app/anleitung/page.tsx", "components/guide/content.tsx", "components/public/marketing.ts",
  "components/public/public-shell.tsx", "components/public/cta-band.tsx", "app/manifest.ts", "app/layout.tsx",
];

test("packages match the business plan (public prices)", () => {
  const by = Object.fromEntries(PACKAGES.map((p) => [p.id, p]));
  assert.deepEqual([by.starter.maxStudents, by.starter.pricePerYear], [100, 990]);
  assert.deepEqual([by.professional.maxStudents, by.professional.pricePerYear], [300, 1490]);
  assert.deepEqual([by.enterprise.maxStudents, by.enterprise.pricePerYear], [800, 3990]);
  assert.deepEqual(PACKAGES.filter((p) => p.recommended).map((p) => p.id), ["professional"]);
});

test("price helpers: Swiss format and per-student maths", () => {
  assert.equal(chf(1490), "1'490");
  assert.equal(chf(3990), "3'990");
  assert.equal(chf(990), "990");
  assert.equal(chf(0.41, 2), "0.41");
  const pro = PACKAGES.find((p) => p.id === "professional");
  assert.equal(perStudentMonth(pro), 0.41);
  assert.equal(perStudentYear(pro), 4.97);
});

test("pilot terms: 30 days, 1 to 2 classes", () => {
  assert.equal(PILOT.days, 30);
  assert.match(PILOT.classes, /1 bis 2 Klassen/);
  const pilot = read("app/pilot/page.tsx");
  assert.match(pilot, /Feedback- und Entscheidungsgespräch/);
});

test("tagline and positioning are used in hero, metadata, footer and manifest", () => {
  assert.equal(BRAND_TAGLINE, "WendApply · Den Bewerbungsprozess sichtbar, planbar und motivierend machen.");
  assert.match(POSITIONING, /^WendApply hilft Sekundarschulen, den Bewerbungsprozess ihrer Schülerinnen und Schüler übersichtlich zu organisieren und durch Gamification die Eigeninitiative zu fördern\.$/);
  assert.ok(manifest().description.startsWith(BRAND_TAGLINE));
  assert.match(read("app/layout.tsx"), /description: BRAND_TAGLINE/);
  assert.match(read("components/public/public-shell.tsx"), /\{BRAND_TAGLINE\}/);
  // Website redesign (copy deck 2026-11-17): the home and /schulen heroes use their own copy; the tagline stays in the footer.
  assert.ok(TAGLINE.endsWith("machen."));
});

test("no checkout or payment provider code on the public site", () => {
  for (const f of SITE_FILES) {
    const src = read(f);
    assert.doesNotMatch(src, /stripe|checkout|paypal|twint/i, f);
  }
  // CTAs are mail links to the one contact constant
  assert.ok(MAIL.demo.startsWith(`mailto:${CONTACT_EMAIL}?subject=`));
  assert.ok(MAIL.offer("Professional").includes(encodeURIComponent("(Professional)")));
  assert.ok(MAIL.pilot.startsWith(`mailto:${CONTACT_EMAIL}`));
  assert.match(read("app/preise/page.tsx"), /Pilot anfragen/);
  assert.match(read("app/preise/page.tsx"), /Offerte anfragen/);
});

test("Swiss spelling: no sharp s in public site files", () => {
  for (const f of SITE_FILES) assert.ok(!read(f).includes("ß"), `${f} contains the sharp s`);
});

test("FAQ 'Müssen Schüler bezahlen?' in Hilfe, guide and /preise: with school licence no, otherwise 7-day trial + abo (access model)", () => {
  for (const f of ["app/hilfe/page.tsx", "components/guide/content.tsx", "app/preise/page.tsx"]) {
    const s = read(f);
    assert.match(s, /Müssen Schülerinnen und Schüler (etwas )?bezahlen\?", a: "(Hat die Schule eine Lizenz, nicht|Mit Schullizenz nicht)/, f);
    assert.match(s, /7 Tage gratis|Gratis-Testwoche/, f);
  }
});

test("privacy overview links all legal documents and covers the roles", () => {
  const p = read("app/datenschutz-uebersicht/page.tsx");
  for (const href of ["/avv", "/loeschkonzept", "/datenschutz-jugend", "/datenschutz-schulen", "/hosting", "/datenschutz"]) assert.ok(p.includes(`"${href}"`), href);
  for (const role of ["Schülerin oder Schüler", "Lehrperson", "Schuladministration"]) assert.ok(p.includes(role), role);
  for (const term of ["DSG", "DSGVO", "HTTPS", "Daten sichern"]) assert.ok(p.includes(term), term);
  assert.doesNotMatch(p, /ISO[- ]?27001 zertifiziert|zertifiziert nach/i, "no invented certifications");
});

test("nav and footer link the new pages; sitemap and robots cover them", () => {
  const shell = read("components/public/public-shell.tsx");
  for (const href of ["/preise", "/pilot", "/datenschutz-uebersicht", "/anleitung", "/schulen"]) assert.ok(shell.includes(`"${href}"`), href);
  const urls = sitemap().map((e) => e.url);
  for (const path of ["/schulen", "/preise", "/pilot", "/datenschutz-uebersicht", "/anleitung", "/hilfe"]) assert.ok(urls.includes(`https://wendapply.ch${path}`), path);
  const r = robots();
  const dis = r.rules[0].disallow;
  for (const path of ["/preise", "/pilot", "/schulen"]) assert.ok(!dis.some((d) => path.startsWith(d)), `${path} must stay indexable`);
  assert.ok(dis.includes("/dashboard") && dis.includes("/api/"));
});

test("every sitemap path has a page", () => {
  for (const { url } of sitemap()) {
    const path = new URL(url).pathname;
    const file = path === "/" ? "app/page.tsx" : `app${path}/page.tsx`;
    assert.ok(statSync(new URL(file, root)).isFile(), file);
  }
});

test("new pages declare canonical metadata", () => {
  for (const [f, c] of [["app/preise/page.tsx", "/preise"], ["app/pilot/page.tsx", "/pilot"], ["app/datenschutz-uebersicht/page.tsx", "/datenschutz-uebersicht"], ["app/schulen/page.tsx", "/schulen"]]) {
    assert.match(read(f), new RegExp(`canonical: "${c}"`), f);
  }
});

test("public pages do not touch Supabase (they must render without the B2B migrations)", () => {
  const dirs = ["app/preise", "app/pilot", "app/datenschutz-uebersicht", "app/schulen"];
  for (const d of dirs) for (const f of readdirSync(new URL(d, root))) {
    const src = read(join(d, f));
    assert.doesNotMatch(src, /supabase/i, `${d}/${f}`);
  }
});
