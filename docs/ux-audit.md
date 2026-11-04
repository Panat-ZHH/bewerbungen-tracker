# UX audit – part A (ux-responsive)

Date: 2026-11-04. Method: headless Chromium (Playwright, installed outside the repo in `~/Projects/bewerbungen-tracker-wt/audit-tools/`, script `audit.mjs`) against `next dev` with a **stubbed Supabase** (all requests to `localhost:54321` are intercepted: session in localStorage, `/auth/v1/user`, `/rest/v1/applications` with 5 fixture rows incl. very long titles). Viewports 375×812 (touch), 768×1024 (touch), 1280×800. Scenarios: login, signup, dashboard (data + empty), applications (data + empty), new application (+ validation errors), detail, edit, "Mehr" sheet. Per scenario: horizontal overflow, interactive elements < 44 px, clipped elements, text < 12 px, console errors, full-page screenshot (`~/Projects/bewerbungen-tracker-wt/screenshots/ux/before-*` / `after-*`).

## Result in short
Console: no errors/warnings on any page. One `h1` per page. The existing pages were in good shape; the real defects were small but visible on phones.

## Findings and fixes
| # | Finding | Where | Fix |
|---|---|---|---|
| 1 | Sticky "Bewerbung speichern" bar sat **behind** the mobile tab bar (both at `bottom: 0`) – the primary action was hidden until the end of the form | `components/applications/application-form.tsx` | sticky bar offset by `--tabbar-h` + safe area, `z-10` |
| 2 | 2 px horizontal page overflow at 375 px on `/applications` (chip scroller used `-mx-[14px]`, page padding is 12 px below 381 px) | `app/applications/page.tsx` | `-mx-3 px-3`, 14 px from 381 px up |
| 3 | Touch targets < 44 px: logo link (36), profile avatar (32), "Konto erstellen/Anmelden" toggle (32), "Stellenanzeige öffnen" (32), tablet nav icons (40×36), settings/logout icons (36) | shell, login, detail | 44 px targets; header nav/icon buttons use `pointer-coarse:` so mouse layout stays compact |
| 4 | `Button` md shrinks to 40 px from `sm` up (`sm:min-h-10`), so form/detail buttons were 40 px on tablets | form, detail | `sm:min-h-11` on those buttons (design-system default untouched, belongs to part B) |
| 5 | Tab label "Bewerbungen" truncated ("Bewerbun…") at 375 px, "Mehr" rendered larger than the other labels (bare text in `<button>`) | `components/layout/workspace-shell.tsx` | 10.5 px labels, no extra padding, "Mehr" in a styled span |
| 6 | Dashboard stat tiles truncated text ("In Bearbeitu…", "Kommt mit d…") at 375 px | `app/dashboard/page.tsx` | shorter copy: Offen / Noch in Arbeit / Noch keine / Insgesamt |
| 7 | Deleting an application used `window.confirm` (ugly, blocks, not styled, unreliable in in-app browsers) | `app/applications/[id]/page.tsx` | confirmation bottom sheet/modal with loading state |
| 8 | Logged-out deep link (e.g. a shared `/applications/…`) lost its target: login always went to `/dashboard` | shell + `app/login/page.tsx` | shell redirects to `/login?next=<path>`; login validates `next` (same-site path only, no `//`, no `/login`) and returns there after sign-in or when already signed in |
| 9 | First-run: empty dashboard had one CTA only | `app/dashboard/page.tsx` | empty state also offers "Stellen suchen" and "Freunde einladen" |
| 10 | `npm run lint` scanned `.claude/worktrees` (24k problems in the main checkout) | `eslint.config.mjs` | ignores `.claude/**`, `**/*.tsbuildinfo`, `out/**`, `build/**`, `next-env.d.ts`. Our own code has 0 lint errors |

After the fixes: 0 px overflow and 0 targets < 44 px on touch viewports on all owned pages (the only remaining < 44 px items are desktop **mouse** nav buttons at 36 px and the modal close button, see open points).

## Verified OK (no change)
Login role choice on signup, validation messages on the new-application form, empty states, status chips scroller (intended horizontal scroll), loading skeletons, detail page with 80-character title (wraps with `break-words`), `Mehr` sheet content, safe-area padding above the tab bar, visible focus on the form.

## Open / for other parts
- `components/ui/modal.tsx` (part B): close button is 40×40 px on phones – should be 44.
- 10.5 px tab-bar labels are below the 12 px text rule; acceptable for a bottom nav but could use the "Mehr" icon-only pattern if premium-ui prefers.
- Dev-only Next.js "N" indicator overlaps the tab bar in screenshots; not present in production builds.
- Not covered here (other parts / tester): friends, classes, invite flow (C), search, map, analytics, CVs, profile, settings (B); real Supabase auth round trip.
- Rerun: `cd ~/Projects/bewerbungen-tracker-wt/audit-tools && TAG=x node audit.mjs` (needs a dev server on 3101 with dummy env).
