# PWA + /anleitung – QA (2026-11-16)

Branch `feature/pwa` = merge of `pwa-core` (a8d3de9) + `pwa-guide` (563fda2) on top of main (fd498c4). Both merged without conflicts.

## Build checks
- `npm ci` ok · `npm run lint`: 0 errors, 9 warnings (pre-existing, not in PWA/guide files) · `npm test`: 452/452 pass · `npm run build`: ok (`/anleitung`, `/manifest.webmanifest` static).

## Browser QA (`scripts/pwa-qa.mjs`, headless Google Chrome via playwright-core)
Run against `next start` on :3193 **and** against the Netlify preview – 22/22 checks pass on both.

| Check | Result |
|---|---|
| (a) `/manifest.webmanifest` valid (name, start_url `/dashboard?source=pwa`, standalone, scope `/`) | ✅ |
| (a) Icons 192, 512, maskable 192/512, apple-touch 180 – HTTP 200 + correct PNG size | ✅ |
| (b) CDP `Page.getInstallabilityErrors` on `/` and `/anleitung` | ✅ `[]` |
| (c) SW registers (scope `/`), controls `/anleitung` and `/dashboard` (logged out → redirect to `/login`, still controlled) | ✅ |
| (c) Offline reload `/anleitung` → cached page; uncached page offline → `offline.html` | ✅ |
| (d) Caches (4 caches, ~44 entries) contain no `*.supabase.co`, `/api/`, `/auth/` | ✅ (dump: `qa/cache-dump.json`) |
| (e) `push` + `notificationclick` handlers in `sw.js` | ✅ |
| (f) `/anleitung` public, 375/1280 px × light/dark: no horizontal overflow, no console errors | ✅ (screenshots in `qa/`) |

Only console noise: a 401 from Supabase auth on `/login` when logged out (expected) and `ERR_INTERNET_DISCONNECTED` during the offline test (expected).

## Lighthouse (mobile, local production server)
| Page | Perf | A11y | Best practices | SEO |
|---|---|---|---|---|
| `/anleitung` | 78 (LCP 4.6 s, TBT 290 ms, CLS 0) | 100 | 100 | 100 |
| `/` | 90 (LCP 3.6 s) | 100 | 100 | 91 (canonical) |

Reports: `lighthouse-anleitung.report.html`, `lighthouse-home.report.html`.

## Preview
https://pwa-preview--bewerbungen-pawat.netlify.app (draft deploy, NOT production; uses the real Supabase project – no data created).

## Open points
- `/anleitung` LCP 4.6 s on simulated mobile: the large screenshots could be lazy-loaded / smaller.
- `/` SEO: canonical link flagged (likely points to wendapply.ch while testing on another host – expected on preview/localhost).
- Logged-in flows (dashboard offline, push subscription) were not tested with a real account on purpose.
