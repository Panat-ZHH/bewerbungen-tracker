# B2B public site (branch b2b-site)

Public marketing and guide pages for selling WendApply to Sek I schools. No login or Supabase is needed, and there is no checkout: every CTA is a `mailto:` to the one contact address.

## Single source of truth
`components/public/marketing.ts` holds the tagline, the positioning sentence, `CONTACT_EMAIL`, the packages (Starter 100/990, Professional 300/1'490 "Empfohlen", Enterprise 800/3'990), the pilot terms (30 days, 1 to 2 classes), the Swiss number format (`chf`), the per-student maths and the `MAIL` links (demo, offer, multi-site, pilot). `public-shell.tsx` re-exports `CONTACT_EMAIL`, so old imports keep working. To change a price, the pilot or the address, edit this file only.

## Pages
| Route | What |
|---|---|
| `/` | Hero eyebrow with the tagline; teacher section with the positioning sentence and links to Preise/Pilot; CTA mentions the 30-day pilot |
| `/schulen` | Tagline hero + positioning; benefits for Lehrpersonen/Schulleitungen and for students (overview, progress, personal village, class village); rollout Demo → 30-Tage-Pilot → Jahreslizenz; privacy highlights; CTA Demo buchen / Offerte anfragen |
| `/preise` (new) | 3 packages, multi-site = individual offer, terms (students pay nothing, yearly contract, monthly payment with a surcharge, offer instead of an online purchase), price FAQ, CTA |
| `/pilot` (new) | 30 days, 1 to 2 classes, time-limited, agreed feedback and decision meeting; 5 steps, what the school gets, what we need, CTA |
| `/datenschutz-uebersicht` (new) | Roles (student, teacher, school admin), a "who sees what" table, principles, deletion/export, hosting/TLS, DSG + DSGVO, links to all legal docs |
| `/hilfe` | New group "Schulen, Preise und Pilot" (anchor `#schulen`) incl. "Müssen Schülerinnen und Schüler bezahlen? Nein." |
| `/anleitung` | FAQ: price answer updated, new "Müssen Schülerinnen und Schüler bezahlen?"; teacher tip links Pilot/Preise |
| `/sitemap.xml`, `/robots.txt` (new) | `app/sitemap.ts` (public pages), `app/robots.ts` (disallows app/API routes) |

Nav: Für Schulen, Preise, Pilot, Anleitung, Hilfe, Kontakt (desktop nav from `lg`, scrollable pill row below that). The footer shows the tagline and has two link columns (product, legal/privacy). The manifest and root metadata descriptions start with the tagline.

## PWA
The service worker is unchanged: new routes are navigations, so they are network-first with an offline fallback. `robots.txt` and `sitemap.xml` are not cached (route null).

## Tests
- `tests/b2b-site.test.mjs` (in `npm test`): prices/maths, pilot terms, tagline usage, no payment code, no sharp s, FAQ "Nein.", privacy links/roles, nav/sitemap/robots, canonical metadata, no Supabase on the new pages.
- `tests/b2b-site-shots.mjs`: screenshots in `docs/b2b/shots/` (375px + 1366px, light + dark), axe WCAG 2 A/AA, overflow and clipped-text check.
