import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { FAMILY, MAIL_FAMILY, WAITLIST_KIND_FAMILY, CONTACT_EMAIL } from "../components/public/marketing.ts";
import sitemap from "../app/sitemap.ts";
import robots from "../app/robots.ts";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const FILES = ["app/familien/page.tsx", "components/public/waitlist-form.tsx", "app/preise/page.tsx", "app/hilfe/page.tsx", "components/public/marketing.ts", "components/public/public-shell.tsx"];

test("family package: 1 student + 1 parent account, CHF 7.90/month or CHF 79/year from the catalogue", () => {
  assert.equal(FAMILY.seatsParents, 1);
  assert.equal(FAMILY.seatsChildren, 1);
  assert.equal(FAMILY.pricePerYear, 79);
  assert.equal(FAMILY.pricePerMonth, 7.9);
  assert.equal(FAMILY.priceMonthText, "CHF 7.90");
  assert.equal(FAMILY.priceYearText, "CHF 79");
  assert.equal(FAMILY.savingText, "CHF 15.80");
  assert.equal("vatNote" in FAMILY, false, "no VAT wording (not MWST-registered)");
  for (const t of ["1 Schüleraccount", "1 Elternaccount", "Gemeinsame Bewerbungsübersicht", "Unterstützung und Begleitung durch die Eltern"]) assert.ok(FAMILY.features.includes(t), t);
  for (const f of ["app/familien/page.tsx", "app/preise/page.tsx"]) {
    const src = read(f);
    assert.match(src, /data-family-price/, f);
    assert.doesNotMatch(src, /pricePlaceholder|data-price-placeholder|noch nicht festgelegt/, f);
  }
  // amounts come from the catalogue, never typed into the page
  assert.doesNotMatch(read("app/familien/page.tsx"), /CHF\s*\d/);
});

test("Familien page covers offer, 4 steps, minors' privacy, FAQ and waitlist CTA", () => {
  const p = read("app/familien/page.tsx");
  for (const t of ["Konto erstellen", "Kind einladen", "Einwilligung", "Fortschritt sehen"]) assert.ok(p.includes(`title: "${t}"`), t);
  for (const t of ["Datenminimierung", "Einwilligung unter 16", "Das Kind entscheidet", "Export und Löschung", "Keine Werbung", "DSG", "DSGVO"]) assert.ok(p.includes(t), t);
  assert.match(p, /canonical: "\/familien"/);
  assert.match(p, /id="warteliste"/);
  assert.match(p, /Zugang anfragen/);
  assert.match(p, /<Faq items=\{faq\}/);
});

test("waitlist form calls only the RPC waitlist_join, lazily, with mailto fallback", () => {
  const f = read("components/public/waitlist-form.tsx");
  assert.match(f, /^"use client";/);
  assert.match(f, /await import\("@\/lib\/supabase"\)/, "Supabase loaded on submit only");
  assert.match(f, /supabase\.rpc\("waitlist_join", \{ p_email: clean, p_kind: kind, p_message: text \}\)/);
  assert.doesNotMatch(f, /\.from\(/, "never touch tables directly");
  assert.match(f, /mailFallback/);
  assert.equal(WAITLIST_KIND_FAMILY, "family");
  assert.ok(MAIL_FAMILY.startsWith(`mailto:${CONTACT_EMAIL}?subject=`));
  assert.doesNotMatch(read("app/familien/page.tsx"), /supabase/i, "page itself renders without Supabase");
});

test("no checkout/payment code and Swiss spelling in family files", () => {
  for (const f of FILES) {
    const src = read(f);
    assert.doesNotMatch(src, /stripe|checkout|paypal|twint/i, f);
    assert.ok(!src.includes("ß"), `${f} contains the sharp s`);
  }
});

test("navigation, footer, sitemap, Preise and Hilfe link /familien; it stays indexable", () => {
  const shell = read("components/public/public-shell.tsx");
  assert.equal(shell.match(/"\/familien"/g)?.length, 2, "header nav + footer");
  assert.ok(sitemap().some((e) => e.url === "https://wendapply.ch/familien"));
  assert.ok(!robots().rules[0].disallow.some((d) => "/familien".startsWith(d)));
  assert.match(read("app/preise/page.tsx"), /href="\/familien#warteliste"/);
  assert.match(read("app/hilfe/page.tsx"), /id: "familien"/);
});
