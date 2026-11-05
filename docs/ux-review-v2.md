# UX review v2 – part A (ux-v2)

Date: 2026-11-05. Method: headless Chrome (playwright-core) against `next dev --webpack` on port 3201 with a **stubbed Supabase** (`scripts/ux-v2-stub.mjs`, nothing real touched). Every route at 375 and 1280 px, light and dark, plus scripted flows.

- `scripts/ux-v2-axe.mjs` – axe-core (WCAG 2.0/2.1 A+AA + best-practice, incl. colour contrast) over 15 routes × 2 viewports × 2 themes = 60 combinations.
- `scripts/ux-v2-flows.mjs` – 30 end-to-end checks (first run, add + validation, save error, status change + undo, delete + undo, login errors, keyboard, reduced motion, friends, classes, settings, 404).
- Screenshots: `~/Projects/bewerbungen-tracker-wt/screenshots/v2/ux/` – `before/` (state at main 2796dbe), `after/` (all routes, 4 variants each), `flows-3/` (flow shots).
- Map UI is out of scope (part C); shop/points wording only reviewed as text.

Result: axe **60/60 combinations clean after the fixes** (before: colour-contrast on dashboard + applications). Flows **30/30 PASS**. `npm run lint` 0 errors, `npx tsc --noEmit` clean, `npm test` all green (incl. new `tests/ux-v2.test.mjs`, 6 tests).

## Defect list

| # | Prio | Route | Defect | Status |
|---|---|---|---|---|
| 1 | P0 | all (links) | Global `a { color: inherit }` was unlayered and beat Tailwind colour utilities: white CTA links (`text-white`) rendered dark on the blue gradient – contrast fail on dashboard, applications | **Fixed** – rule moved into `@layer base` (`app/globals.css`) |
| 2 | P0 | `/applications` (dark) | Selected status chip: white on light-blue brand (2.8:1) | **Fixed** – uses `--on-brand` |
| 3 | P0 | all writes | Raw Supabase/fetch text ("Database error…", "Failed to fetch") could reach users | **Fixed** – `lib/ux.ts` `friendlyMessage`/`generalCause`/`authMessage`; every catch in applications, CVs, profile, search, settings, friends, classes uses them |
| 4 | P1 | `/applications/new`, edit | Validation: errors only inline, no summary, focus stayed on the button | **Fixed** – summary `role="alert"`, focus moves to first invalid field (`aria-invalid`), per-status hint text under "Was ist der Stand?" |
| 5 | P1 | `/applications/[id]` | Status change silent; delete used `window.confirm`, no undo | **Fixed** – toast "Stand geändert: …" with *Rückgängig*; styled confirm dialog; after delete a toast with *Rückgängig* that re-creates the row |
| 6 | P1 | global | No feedback component; success text mixed into error banners (detected via `/nicht/` regex) | **Fixed** – `lib/toast.ts` + `components/ui/toaster.tsx` (aria-live, mounted in `app/layout.tsx`), banners now error-only |
| 7 | P1 | `/login` | Wrong-password message raw; no "Passwort vergessen"; no show-password; no password strength hint | **Fixed** – friendly messages, forgot-password flow + new `/login/reset` page, show/hide password with `aria-label`, `passwordHint` |
| 8 | P1 | `/settings` | `window.confirm` for "Meine Daten löschen"; vague success texts | **Fixed** – `Modal` confirm, specific success text (file name, where to find imported data) |
| 9 | P1 | `/cvs` | Success/failure told apart by regex; no file type/size check; no empty state | **Fixed** – client-side check (PDF/Word, ≤ 10 MB) with specific message, EmptyState |
| 10 | P1 | `/dashboard` first run | Empty dashboard had unclear next step | **Fixed** – "Willkommen! So startest du in drei Schritten" with CTA "Erste Bewerbung eintragen" (white text verified at 375/375 dark/1280) |
| 11 | P1 | `/search` | Blank page before first search; raw error text | **Fixed** – "So geht die Suche" card, friendly errors, toast on "Merken" |
| 12 | P1 | `/friends`, `/classes`, `/classes/join/[code]` | Technical error codes (USER_NOT_FOUND, CLASS_NOT_FOUND) leaked | **Fixed** – mapped to "Wir haben niemanden gefunden…" / "Diesen Klassencode gibt es nicht…" (`components/friends/shared.ts`, `components/classes/shared.tsx`) |
| 13 | P2 | all | Focus ring forced `border-radius: 6px` (clipped rings on round buttons) | **Fixed** |
| 14 | P2 | deadlines | Raw date only | **Fixed** – `deadlineInfo` ("morgen", "in 3 Tagen", "vor 2 Tagen abgelaufen") with tone |
| 15 | P2 | status labels | "Angebot" vs "Zusage" | Already **Zusage** everywhere (`tests/zusage-rename.test.mjs`) |
| 16 | P2 | `/applications/[id]` | Toast ("Wieder auf …") overlaps the bottom of the delete sheet on 375 px while both are open | Open – cosmetic, short-lived |
| 17 | P2 | dev only | Next.js dev "N" indicator covers the first tab in screenshots | Not a defect (absent in production) |
| 18 | P2 | `components/ui/modal.tsx` close button (flagged 40 px in the earlier audit) | Verified: already 44×44 px |

## Verified OK
Landmarks (`header`, `nav`, `main`), one `h1` per page, skip link as first Tab stop, 3 px focus ring visible, `prefers-reduced-motion` disables animations (duration 1e-6 s), aria-labels on icon-only buttons, labels bound to inputs (axe `label` clean), 404 page German with way back, dark theme contrast AA on all 15 routes, no console errors on the add flow.

## Not covered / open
- Real Supabase round trip (email confirmation, password-reset mail) – only stubbed.
- `/login/reset` handles the recovery session in the browser; needs `redirectTo` URL whitelisted in Supabase Auth settings (`<site>/login/reset`) – **manual setting, no migration**.
- Item 16 above.
- Edits outside owned files: none (`components/layout/workspace-shell.tsx` untouched).

## Migrations
None.

## Rerun
```
export PLAYWRIGHT=~/Projects/bewerbungen-tracker-wt/audit-tools/node_modules/playwright-core/index.mjs CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=dummy npx next dev --webpack -p 3201 &
node scripts/ux-v2-flows.mjs ; node scripts/ux-v2-axe.mjs --shots after
```
