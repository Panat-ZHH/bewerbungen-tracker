import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { PAGE_SEO, publicMetadata, publicBreadcrumb } from "../lib/seo/pages.ts";
import { OFFER } from "../lib/seo/offer.ts";
import { SITE_URL, homeJsonLd, faqJsonLd, nodeText, jsonLdString, INDEX, NOINDEX } from "../lib/seo/site.ts";
import { PACKAGES } from "../components/public/marketing.ts";
import sitemap from "../app/sitemap.ts";
import robots from "../app/robots.ts";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const fileOf = (path) => (path === "/" ? "app/page.tsx" : `app${path}/page.tsx`);
const fullTitle = (path) => (path === "/" ? PAGE_SEO[path].title : `${PAGE_SEO[path].title} | WendApply`);
const PERMANENT_FREE = /immer kostenlos|für immer|immer gratis|gratis|dauerhaft kostenlos|lebenslang/i;

test("every public page has a unique title (<= 60 incl. brand at the end) and description (140-160)", () => {
  const titles = new Set(), descs = new Set();
  for (const path of Object.keys(PAGE_SEO)) {
    const t = fullTitle(path), d = PAGE_SEO[path].description;
    assert.ok(t.length <= 60, `${path} title ${t.length}: ${t}`);
    assert.ok(t.endsWith("| WendApply"), `${path} brand at the end`);
    assert.ok(d.length >= 140 && d.length <= 160, `${path} description ${d.length}`);
    assert.ok(!titles.has(t) && !descs.has(d), `${path} duplicate`);
    titles.add(t); descs.add(d);
    assert.ok(!(t + d).includes("ß"), `${path} Swiss spelling`);
    assert.doesNotMatch(t + d, PERMANENT_FREE, `${path} no permanent-free claim`);
  }
});

test("sitemap lists exactly the indexable pages; each page uses publicMetadata and breadcrumbs", () => {
  const paths = sitemap().map((e) => new URL(e.url).pathname);
  assert.deepEqual([...paths].sort(), Object.keys(PAGE_SEO).sort());
  for (const e of sitemap()) {
    assert.ok(e.url.startsWith(SITE_URL));
    assert.match(String(e.lastModified), /^\d{4}-\d{2}-\d{2}$/);
  }
  for (const path of Object.keys(PAGE_SEO)) {
    const src = read(fileOf(path));
    assert.ok(src.includes(`publicMetadata({ canonical: "${path}" })`), `${path} metadata`);
    if (path !== "/") assert.ok(src.includes(`publicBreadcrumb("${path}")`), `${path} breadcrumb`);
  }
});

test("page metadata: canonical, index, Open Graph de_CH with 1200x630 image, Twitter large card", () => {
  for (const path of Object.keys(PAGE_SEO)) {
    const m = publicMetadata({ canonical: path });
    assert.equal(m.alternates.canonical, path);
    assert.deepEqual(m.robots, INDEX);
    assert.equal(m.openGraph.locale, "de_CH");
    assert.equal(m.openGraph.siteName, "WendApply");
    assert.equal(m.openGraph.url, path);
    assert.equal(m.openGraph.title, fullTitle(path));
    assert.deepEqual([m.openGraph.images[0].width, m.openGraph.images[0].height], [1200, 630]);
    assert.equal(m.twitter.card, "summary_large_image");
  }
  assert.equal(publicMetadata({ canonical: "/schulen" }).openGraph.images[0].url, "/og/og-schulen.png");
  assert.equal(publicMetadata({ canonical: "/familien" }).openGraph.images[0].url, "/og/og-familien.png");
  assert.equal(publicMetadata({ canonical: "/" }).openGraph.images[0].url, "/og/og-default.png");
  assert.deepEqual(publicMetadata({ canonical: "/" }).title, { absolute: PAGE_SEO["/"].title });
  assert.match(PAGE_SEO["/preise"].description, new RegExp(`CHF ${Math.min(...PACKAGES.map((p) => p.pricePerYear))}`));
});

test("root layout: metadataBase, de-CH, noindex by default; 404 is noindex", () => {
  const layout = read("app/layout.tsx");
  assert.match(layout, /metadataBase: new URL\(SITE_URL\)/);
  assert.match(layout, /robots: NOINDEX/);
  assert.match(layout, /<html lang=\{SITE_LANG\}/);
  assert.match(read("lib/seo/site.ts"), /SITE_LANG = "de-CH"/);
  assert.deepEqual(NOINDEX, { index: false, follow: false });
  assert.match(read("app/not-found.tsx"), /robots: \{ index: false/);
  assert.doesNotMatch(read("lib/seo/site.ts"), /languages:/, "German only: no fake hreflang alternates");
});

test("robots.txt blocks the app but keeps every public page crawlable", () => {
  const r = robots();
  const dis = r.rules[0].disallow;
  const blocked = (p) => dis.some((d) => (d.endsWith("$") ? p === d.slice(0, -1) : p.startsWith(d)));
  for (const p of Object.keys(PAGE_SEO)) assert.ok(!blocked(p), `${p} must stay crawlable`);
  for (const p of ["/dashboard", "/api/x", "/familie", "/familie/einladung/abc", "/schul-admin", "/teacher/classes", "/login", "/onboarding"]) assert.ok(blocked(p), `${p} must be blocked`);
  assert.equal(r.sitemap, "https://wendapply.ch/sitemap.xml");
});

test("offer comes from lib/seo/offer.ts: 7-day trial + Einzelabo price (access model), no permanent-free claim", () => {
  assert.equal(OFFER.price, 4.9);
  assert.equal(OFFER.priceCurrency, "CHF");
  assert.match(OFFER.label, /7 Tage kostenlos testen/);
  assert.doesNotMatch(OFFER.label + OFFER.description, PERMANENT_FREE);
  const app = homeJsonLd()["@graph"].find((n) => n["@type"] === "SoftwareApplication");
  assert.equal(app.offers.price, "4.90");
  assert.equal(app.offers.priceCurrency, OFFER.priceCurrency);
  assert.equal(app.offers.description, OFFER.description);
  assert.doesNotMatch(read("lib/seo/site.ts"), /price: 0|"0\.00"|kostenlos/, "no second source for the offer");
});

test("home JSON-LD: Organization, WebSite, SoftwareApplication with required fields", () => {
  const g = homeJsonLd();
  assert.equal(g["@context"], "https://schema.org");
  const by = Object.fromEntries(g["@graph"].map((n) => [n["@type"], n]));
  assert.ok(by.Organization.name && by.Organization.url && by.Organization.logo.url);
  assert.equal(by.WebSite.url, SITE_URL);
  assert.equal(by.WebSite.inLanguage, "de-CH");
  const app = by.SoftwareApplication;
  for (const k of ["name", "applicationCategory", "operatingSystem", "offers"]) assert.ok(app[k], k);
  assert.match(app.operatingSystem, /Web/);
  assert.ok(!("aggregateRating" in app) && !("review" in app), "no invented ratings");
  JSON.parse(jsonLdString(g));
});

test("breadcrumbs and FAQ JSON-LD match the visible text", () => {
  const b = publicBreadcrumb("/schulen");
  assert.equal(b["@type"], "BreadcrumbList");
  assert.deepEqual(b.itemListElement.map((i) => [i.position, i.name, i.item]), [[1, "Start", "https://wendapply.ch"], [2, "Für Schulen", "https://wendapply.ch/schulen"]]);
  // JSX answers (links, strong) become their visible text
  const el = (children) => ({ props: { children } });
  assert.equal(nodeText(["Ja, mit dem ", el("30-Tage-Pilot"), " für ", 2, " Klassen."]), "Ja, mit dem 30-Tage-Pilot für 2 Klassen.");
  const f = faqJsonLd([{ q: "Frage?", a: ["Antwort mit ", el(el("Link")), "."] }]);
  assert.equal(f.mainEntity[0].acceptedAnswer.text, "Antwort mit Link.");
  assert.equal(jsonLdString({ a: "</script>" }), '{"a":"\\u003c/script>"}');
  for (const p of ["app/familien/page.tsx", "app/preise/page.tsx", "app/anleitung/page.tsx"]) assert.match(read(p), /faqJsonLd\(faq\)/, p);
  assert.match(read("app/hilfe/page.tsx"), /faqJsonLd\(groups\.flatMap/);
});

test("social images referenced by the SEO config are 1200x630 PNGs once the images work has landed", () => {
  for (const f of ["og-default.png", "og-schulen.png", "og-familien.png"]) {
    const p = new URL(`../public/og/${f}`, import.meta.url);
    if (!existsSync(p)) continue; // created by the parallel images branch; checked again after the merge
    const buf = readFileSync(p);
    assert.equal(buf.toString("ascii", 1, 4), "PNG", f);
    assert.deepEqual([buf.readUInt32BE(16), buf.readUInt32BE(20)], [1200, 630], f);
  }
});
