# Report: b2b-site

**Built:** new pages /preise, /pilot and /datenschutz-uebersicht; rewrote /schulen; updated the landing, Hilfe and Anleitung FAQ, nav/footer, root metadata, manifest description, sitemap and robots. All copy and prices come from `components/public/marketing.ts`. There is no payment or checkout code. CTAs are mailto links to info.wendico@gmail.com (the existing contact constant). See SITE.md.

**Results:** `npx tsc --noEmit` OK · `npm run lint` 0 errors (9 warnings that were already there, none in these files) · `npm test` 464/464 pass (12 new) · `npm run build` OK (with placeholder public Supabase env) · headless check of 6 pages × 375/1366 × light/dark: no overflow, no clipped text, 0 axe violations, no JS errors. Screenshots are in docs/b2b/shots/.

**Open questions**
1. **Is the pilot free?** The live site already promised a "kostenloser Pilot" (1 to 3 classes, one semester). The new copy says 30 days, 1 to 2 classes, and that the school pays no licence fee for the pilot (`PILOT.free = true`). Set it to `false` if that is not true.
2. **Does the page show features before they exist?** Schulen/Preise/Datenschutz mention class goals, the class village, statistics for the school head and a school admin role. These come from the b2b-app/b2b-db parts and are not live yet. Check the wording after those parts merge, and check the "who sees what" table against the final RLS policies.
3. Per-student figures on /preise: Starter shows CHF 9.90, Pro 4.97 and Enterprise 4.99 per student and year at full capacity. Fine to show?
4. VAT: the page says "Ob und welche Mehrwertsteuer dazukommt, steht in der Offerte". Please confirm.
5. Demo/offer requests go to info.wendico@gmail.com. Should there be a dedicated sales address?
6. The legal docs are still drafts (v0.9, not reviewed by a lawyer). The overview says so.
