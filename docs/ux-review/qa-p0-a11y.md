# QA p0: accessibility and copy (release-p0)

Date 2026-11-06. Method: dev server (webpack) against the Supabase stub from `scripts/ux-v2-stub.mjs` (no live data touched), Chrome via Playwright, axe-core 4.x (`wcag2a/aa`, `wcag21a/aa`, `wcag22aa`, best-practice). Script: `scripts/qa-p0-axe.mjs` (new, re-runnable).

## Coverage
34 routes x 375/1280 px x light/dark = 136 runs: all public pages (landing, login, login/reset, schulen, impressum, kontakt, hilfe, datenschutz, datenschutz-jugend, datenschutz-schulen, hosting, avv, loeschkonzept, 404), student pages (dashboard, applications incl. new/detail, profile, settings, cvs, search, analytics, friends incl. detail, invite, classes incl. detail/join, map, onboarding) and teacher pages (overview, class, onboarding).

## Result
| Check | Result |
|---|---|
| axe, all runs | After fixes: 0 serious/critical, 0 colour-contrast findings in light and dark. |
| Contrast `--muted` | Light #5f5f66 on white about 6.0:1, on paper #edf1f6 about 5.3:1. Dark #9aa3b2 on #0d1118 about 7.5:1. Placeholders (light #737378, dark #8892a3) both above 4.5:1. |
| Keyboard focus | Tabbed up to 40 stops on 11 pages x light/dark: every stop shows an outline or ring (global `:focus-visible` 3px). Only the Next dev overlay `nextjs-portal` has none (dev only). |
| Reduced motion | Global `prefers-reduced-motion` rule, confetti hidden; with `reducedMotion: reduce` no infinite animations were running on the 11 pages. |
| Touch targets | Nav, buttons, chips are >= 44px. Under 24px: skip link (off-screen by design), hidden file inputs, inline links in running text (exempt, WCAG 2.5.8) and checkboxes of 19-20px inside labels (open, see below). |
| Page titles | Fixed, see below. All routes now have a unique title ending in `WendApply`. |
| Spelling | No `ß` in UI text (only in normaliser regexes). No "Strasse"-type mistakes found. |
| Placeholders | No lorem/TBD/FIXME in UI. Only intentional `[TODO]` markers in Impressum (street, UID, phone), known and listed in `docs/p0-release.md`. Input placeholders are all realistic examples (beispiel.ch). |

## Fixed (commits on release-p0)
1. **scrollable-region-focusable (serious)** on the legal tables (`/datenschutz`, `/datenschutz-schulen`, `/hosting`, `/avv`, `/loeschkonzept` at 375 px): the horizontally scrolling table wrapper is now `tabIndex=0` with `role=group` and a label, so keyboard users can scroll it (`components/legal/markdown.tsx`).
2. **Duplicate or generic titles**: `/login/reset` (was "Anmelden"), `/applications/new` and `/applications/[id]` (both "Bewerbungen"), `/friends/[id]`, `/classes/[id]`, `/classes/join/[code]`, `/teacher` (had the default title), `/teacher/onboarding`, student profile, 404. Added route layouts with metadata; `/teacher` moved into the route group `app/teacher/(home)` (URL unchanged). Note: a plain-string title in a nested layout drops the root template, so these use `absolute: "X | WendApply"`.
3. **Gender form**: three variants were mixed ("Schüler", "Schüler:innen", "Schülerinnen und Schüler"). Rule now: full pair "Schülerinnen und Schüler" in running text, short "Schüler:in/Schüler:innen" in labels, tabs, tiles, role chips. Generic masculine "Schüler" removed in teacher screens (tabs, tiles, search label, table caption, modals).

## Checked, no change needed
- Du/Dein: app text is consistently informal and lowercase mid-sentence (no capitalised "Du/Dein" in running text). "Sie" appears only on school-facing public pages (landing teacher bullet, /schulen, /kontakt, /hilfe teacher answers), which is deliberate. "Ihr seid" for friend pairs is plural du-form.
- Skip link, landmarks (one `main`, labelled navs), one `h1` per page.

## Open / notes
- Checkboxes 19-20px (`/settings`, `/applications/[id]`, `/classes` join, search filter): the label row is the real target and is >= 44px high in most places; enlarging the box itself would be a design change. WCAG 2.2 AA 2.5.8 is met through the label/spacing exception. Not changed.
- `/invite/[code]` briefly renders without `h1` while the invite loads (moderate `page-has-heading-one`, transient).
- Public pages mix "Sie" (schools) and "du" (students) by design; the vault UX review may want an explicit copy guide.
- `tsc` shows stale `.next/dev` types after the route-group move; `rm -rf .next/dev` (done here). `next build --webpack` passes, `npm test` 289/289.
