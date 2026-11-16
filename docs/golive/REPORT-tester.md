# Go-live tester report (feature/pwa) – 2026-11-16

Branch `feature/pwa` already contains `origin/main` (fd498c4, unchanged after `git fetch`). No merge needed.

## Checks
- `npm ci` ok · `npx tsc --noEmit` ok · `npm run lint` 0 errors (9 old warnings) · `npm test` 544/544 · `npm run build` ok.
- Build contains `/`, `/login`, `/preise`, `/pilot`, `/schulen`, `/familien`, `/familie`, `/anleitung`, `/manifest.webmanifest`
  (from `app/manifest.ts`); `public/sw.js` and `public/offline.html` exist.
- No code fixes were needed.

## Environment variables
New vs main: only `NEXT_PUBLIC_PWA_DEV` (optional, dev-only flag to register the SW on localhost; not needed in production).
Other new `process.env` hits are test/QA script variables. **No new production env vars.**

## Cleanup
Removed `docs/b2b/shots` (5.3 MB) and `docs/family/shots` (2.9 MB) – generated demo screenshots, not referenced by code,
repo is public. `docs/*/shots/` is now in `.gitignore` (the shot scripts still write there locally).

## Risks for production
- B2B (4 × `20261116*_b2b_*.sql`) and family migrations are NOT applied to the live DB. The UI degrades gracefully
  ("kommen bald"/"wird eingerichtet"/"bald verfügbar", waitlist falls back to e-mail), but the new features stay inactive
  until the migrations are applied (needs Panat's approval).
- Open product/legal decisions (REPORT-b2b-merge.md, REVIEW.md #3–#5, REPORT-fam-merge.md): pilot free?, 10 % monthly surcharge,
  seat limit 60, family price, consent age 16, VAT wording, legal review of AVV/DSFA/privacy texts.
- The service worker (already on main) changes with this branch; it excludes Supabase/API from caches (pwa-qa 22/22 earlier).
- Screenshots remain in earlier git history of this branch (not on main); harmless demo data.
