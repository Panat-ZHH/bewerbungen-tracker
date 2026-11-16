# SEO report: technical and on-page SEO for the public site (branch `seo-meta`)

Date: 2026-11-16. Nothing was pushed or deployed. No images, `public/og` or icon files were touched (the parallel images branch owns them).

## What changed

**Central config (new)**
- `lib/seo/offer.ts` holds the one consumer offer for structured data: CHF 0, "kostenlos während der Lancierung". To switch to paid plans later, change only this file. It contains no permanent-free claim.
- `lib/seo/pages.ts` holds the title, description, social image and breadcrumb label of every indexable page. It provides `publicMetadata()` and `publicBreadcrumb()`.
- `lib/seo/site.ts` holds the site constants and `pageMetadata()`, which sets canonical, robots index, Open Graph `de_CH` with a 1200x630 image, and a Twitter `summary_large_image` card. It also builds the JSON-LD (Organization, WebSite, SoftwareApplication, BreadcrumbList, FAQPage) and escapes it against `</script>`.
- `components/seo/json-ld.tsx` is a small server component that renders the JSON-LD.

**Root layout**
- Adds `metadataBase: https://wendapply.ch`. Canonicals used to render as relative `/…`, which was the only Lighthouse SEO failure.
- `<html lang="de-CH">`.
- Default Open Graph and Twitter values.
- **noindex by default.** This covers every app route behind the login, including client layouts like `/teacher` that cannot export metadata. Public pages opt back in through `publicMetadata()`.

**Per page**
- All 16 public pages now use `publicMetadata`.
- Every subpage has BreadcrumbList.
- FAQPage JSON-LD is on `/anleitung`, `/hilfe`, `/preise` and `/familien`. The text is extracted from the visible FAQ answers, so it always matches what users read.
- Home has the Organization + WebSite + SoftwareApplication graph.

**Sitemap**
- Adds `lastModified`: 2026-11-16 for site pages, and 2026-11-06 (LEGAL_STAND) for legal pages.
- A test now enforces that the sitemap equals the set of pages in `PAGE_SEO`.

**robots.txt**
- Adds `/schul-admin`, `/familie/` and `/familie$`. A plain `/familie` rule would also have blocked `/familien`.
- Uses the shared SITE_URL.

**404 page**
- noindex.
- "Zur Startseite" now goes to `/` instead of `/dashboard`, so logged-out visitors are no longer sent to the login.
- Adds a second link to Hilfe.

**Light copy changes**
- Home, "Finden, bewerben, dranbleiben" intro: now "…hilft dir, deine Bewerbungen zu organisieren und den Überblick zu behalten…".
- /schulen teachers intro: now "Den Stand der Klasse in der Berufswahl kennen…".
- No new claims.

**Small fix**
- The /onboarding title was rendering as "Willkommen – WendApply | WendApply".

**Tests**
- New `tests/seo.test.mjs` (9 tests). It checks lengths, uniqueness, canonical/OG/Twitter, the robots rules, the noindex default, the single offer source, the JSON-LD required fields, FAQ text extraction, and that the OG PNGs are 1200x630 once they exist.
- `tests/guide.test.mjs` was updated to the new metadata helper.

## Titles and descriptions

| Page | Title (brand at end) | Chars | Desc chars |
|---|---|---|---|
| / | Bewerbungs-Tracker für die Lehrstellensuche \| WendApply | 55 | 151 |
| /schulen | Berufswahl an der Sekundarschule begleiten \| WendApply | 54 | 152 |
| /familien | Lehrstellensuche als Familie begleiten \| WendApply | 50 | 145 |
| /preise | Preise für Schulen: Jahreslizenz ab CHF 990 \| WendApply | 55 | 141 |
| /pilot | 30-Tage-Pilot für Sekundarschulen \| WendApply | 45 | 151 |
| /anleitung | Anleitung: Bewerbungen organisieren \| WendApply | 47 | 151 |
| /hilfe | Hilfe und häufige Fragen \| WendApply | 36 | 145 |
| /kontakt | Kontakt, Demo und Pilot-Anfrage \| WendApply | 43 | 143 |
| /impressum | Impressum \| WendApply | 21 | 148 |
| /datenschutz-uebersicht | Datenschutz im Überblick \| WendApply | 36 | 150 |
| /datenschutz | Datenschutzerklärung \| WendApply | 32 | 152 |
| /datenschutz-jugend | Datenschutz für Jugendliche \| WendApply | 39 | 155 |
| /datenschutz-schulen | Datenschutz für Schulen \| WendApply | 35 | 145 |
| /avv | Auftragsbearbeitung (AVV/DPA) \| WendApply | 41 | 150 |
| /hosting | Hosting und Unterauftragsbearbeiter \| WendApply | 47 | 148 |
| /loeschkonzept | Löschkonzept am Klassenende \| WendApply | 39 | 153 |

The description texts are in `lib/seo/pages.ts`. The price "ab CHF 990" is computed from `PACKAGES`, so it follows `lib/b2b/licence.ts`, which was not changed.

**Social images**
- `/schulen` uses `/og/og-schulen.png`.
- `/familien` uses `/og/og-familien.png`.
- Every other page uses `/og/og-default.png`.

## Keywords

None of the volumes below come from measured data. No public keyword-volume data for Switzerland was available, so they are rough estimates based on the competitors ranking for each term.

**German, primary (tool intent, low competition, no Swiss competitor)**
- Bewerbungstracker / Bewerbungs-Tracker
- Bewerbungen organisieren
- Bewerbungen verwalten App
- Bewerbungsübersicht Vorlage
- Berufswahlunterricht (B2B)

**German, secondary (high volume, dominated by yousty.ch, berufsberatung.ch and gateway.one)**
- Lehrstelle finden
- Lehrstellen Schweiz
- Lehrstellensuche Schweiz
- Schnupperlehre finden
- Lehrstellenbewerbung
- Berufswahl Sekundarschule
- Bewerbungsprozess Schule

**German, long-tail ideas**
- Bewerbungsliste Lehrstelle Vorlage
- Schnupperlehre Übersicht Vorlage
- Bewerbungen nachfassen Lehrstelle Fristen
- Berufswahl Klassenübersicht Lehrperson
- Berufswahlprozess Klasse digital begleiten
- Lehrstellensuche Eltern unterstützen

**English (low fit)**
- job application tracker: high global volume, dominated by Teal and Huntr, very little Swiss share.
- apprenticeship application tracker Switzerland: almost no volume.

**Closest competitor**
- Berufswahl-Portal SG has a teacher overview, but only in the canton of St. Gallen.

## Multilingual

The site is German only, so there is **no hreflang**. Only `lang="de-CH"` and `og:locale de_CH` are set.

A full English version is not worth it now: pupils, teachers and Lehrstellen are all German-language. The cheap option is one English page for expat parents (how the Lehre works plus the family plan). French and Italian would bring more reach than English.

## Lighthouse (mobile, production build `next start`, local)

| Page | Perf | A11y | Best Pr. | SEO |
|---|---|---|---|---|
| / before | 89 | 100 | 100 | **92** |
| / after (3 runs: 89, 83, 90) | 89 | 100 | 100 | **100** |
| /schulen before | 90 | 100 | 100 | **92** |
| /schulen after (3 runs: 91, 92, 91) | 91 | 100 | 100 | **100** |

- The SEO points came back from the absolute canonical.
- Performance is unchanged within noise. The baseline is a single run; the "after" figure is the median of three.

**Fonts and blocking resources**
- Fonts already use `next/font` (self-hosted, `display: swap`).
- The only render-blocking resource is the single CSS file (about 150 ms).

**Remaining performance item (for the images branch, not changed here)**
- On the home page, Lighthouse's LCP element is the *dark-theme* screenshot. Headless Chrome ran in dark mode, and that image is `loading="lazy"`; only the light variant gets `priority`.
- This affects real users who use dark mode. Possible fixes in `components/public/screenshot.tsx`:
  - a `<picture>` with a `prefers-color-scheme` source, or
  - eager loading for the dark variant when `priority` is set.

## Free-offer wording

No copy claims permanent free use. There is no "immer kostenlos" or "für immer gratis", and the tests now guard against it.

The existing lines "kostenlos für Schülerinnen und Schüler" (home hero, /schulen, /preise, Hilfe and guide FAQ) describe the school-licence model: the school pays, pupils do not. I left them as they are.

The home page sticker "Kostenlos für dich" and the hero sentence read as unconditional for pupils who sign up without a school. Once paid plans start, they should probably say "kostenlos während der Lancierung" or point to `OFFER.label`.

## Open questions for Panat

1. **Free-offer wording:** is "kostenlos während der Lancierung" right for the structured data, and should the home sticker and hero switch to it too?
2. **Google Search Console:** verify the wendapply.ch domain. A DNS TXT record is preferred; a `verification.google` meta tag could be added in `app/layout.tsx` instead. Then submit `https://wendapply.ch/sitemap.xml`. Bing Webmaster Tools could import from GSC.
3. **English page for expat parents:** worth it later? Full translation is not recommended for now.
4. **Organization data:** the Impressum still has TODOs (street, UID). The JSON-LD only uses name "Wendico", Kleinandelfingen, CH, and the contact e-mail. Add the full address once confirmed.
5. **Content for the primary keywords:** a "Bewerbungsübersicht Vorlage" page (free template that leads into the app) and a "Berufswahlunterricht" page for teachers would target low-competition terms that have no Swiss tool competitor.
6. **SoftwareApplication rich results:** Google needs a rating or review for these. None exist, and none were invented, so the markup is valid but no star snippet will show for now.
