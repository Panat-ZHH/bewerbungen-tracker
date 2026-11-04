# Responsive audit

Generated 2026-11-04 21:24 by `scripts/responsive-audit.mjs` (phase `before`).

Matrix: 19 routes × 11 viewports (320, 360, 375, 390, 430, 667x375, 844x390, 768, 820, 1024, 1280) × themes (light, dark). Supabase fully mocked (German fixtures with very long names). Screenshots: `/Users/panat.ruangsri/Projects/bewerbungen-tracker-wt/screenshots/responsive/before`. Machine-readable: `docs/responsive-audit.json`.

Re-run: `node scripts/responsive-audit.mjs --phase after` (builds + starts the app on :3150; add `--dev` for dev server, `--routes /map,/friends`, `--widths 320,375`, `--themes light`, `--base http://localhost:3000` to reuse a running server).

## Summary

| Group | Defects |
|---|---|
| GROUP1 core (layout, nav/tab bar, login, dashboard, applications*, map, profile, shared components) | **46** |
| GROUP2 social (classes*, teacher overview, friends, invite) | **24** |
| GROUP3 (settings, cvs, search, analytics) | **8** |
| **Total** | **78** |

By type: Modal taller than viewport 1 · Touch target < 44px 33 · Input font-size < 16px 35 · Fixed/sticky bar covers content 2 · Clipped content 4 · Map touch behaviour 1 · Horizontal overflow 2

Method notes: a defect is one (route, check, selector) aggregated over all widths/themes where it occurs; defects whose source file is a shared component/layout are listed once under GROUP1 `(shared)` with the routes they appear on. Selectors are tag/class paths (no positional index). Source file = best-effort text/class match in the codebase. Tap-target and font-size checks run on phone viewports (≤430 wide portrait and 667×375 / 844×390 landscape) only. Dialog checks open up to 6 opener buttons per page (light theme) and measure the resulting dialog. Dark mode is covered by screenshots and all DOM checks; colour contrast is not computed (review screenshots).

### Map page info

- html overscroll-behavior-y=auto, body=auto

## GROUP1 core (layout, nav/tab bar, login, dashboard, applications*, map, profile, shared components)

46 defects.

### Shared components / layout / navigation

**#1** — Modal taller than viewport
- Route: shared — friends
- Width(s): 430 · theme: light
- Element: `div.fixed.inset-0.z-[100] > div.animate-sheet.sm:animate-pop.relative[role=dialog]` — e.g. “dialog opened via "Marco Bianchi-Fuchsenber"”, “dialog opened via "Nora Keller entfernen"”
- Problem: dialog is 256px tall (top 737, bottom 993) in a 993px viewport, 458px wide
- Suggested fix: Give the dialog `max-h-[calc(100dvh-2rem)]` with `overflow-y-auto` on the body (header/footer pinned); on phones use a bottom sheet. (no internal scroll)
- File: `components/ui/modal.tsx`

**#2** — Touch target < 44px
- Route: shared — classes-detail-teacher
- Width(s): 320, 360, 375, 390, 430, 667x375, 844x390 · theme: light/dark
- Element: `div.space-y-3 > div.inline-flex.max-w-full.gap-1[role=tablist] > button.inline-flex.min-h-9.shrink-0[role=tab]` — e.g. “Alle 6”, “Inaktiv (30 T) 1”, “Aktiv (7 T) 1”
- Problem: interactive element is 78×36px (< 44×44)
- Suggested fix: Increase hit area to >= 44x44px on touch (e.g. `min-h-11 min-w-11`, padding, or an invisible ::after with inset -8px). Measured 78x36.
- File: `components/ui/button.tsx`

**#3** — Touch target < 44px
- Route: shared — classes-detail-teacher
- Width(s): 320, 360, 375, 390, 430, 667x375, 844x390 · theme: light/dark
- Element: `div.flex.flex-col.gap-3 > div.inline-flex.max-w-full.gap-1[role=tablist] > button.inline-flex.min-h-9.shrink-0[role=tab]` — e.g. “Name”
- Problem: interactive element is 68×36px (< 44×44)
- Suggested fix: Increase hit area to >= 44x44px on touch (e.g. `min-h-11 min-w-11`, padding, or an invisible ::after with inset -8px). Measured 68x36.
- File: `components/ui/button.tsx`

**#4** — Input font-size < 16px
- Route: shared — classes-teacher
- Width(s): 320, 360, 375, 390, 430, 667x375, 844x390 · theme: light
- Element: `form.space-y-4 > div.space-y-1.5 > input#class-year.min-h-11.w-full.rounded-xl` — e.g. “2026/27 (dialog "Klasse erstellen")”
- Problem: computed font-size 15px (< 16px → iOS Safari zooms the page on focus)
- Suggested fix: Use `text-base` (16px) on inputs at mobile widths (e.g. `text-base sm:text-sm`) to prevent iOS zoom-on-focus. Measured 15px.
- File: `components/ui/input.tsx`

**#5** — Input font-size < 16px
- Route: shared — classes-teacher
- Width(s): 320, 360, 375, 390, 430, 667x375, 844x390 · theme: light
- Element: `form.space-y-4 > div.space-y-1.5 > input#class-name.min-h-11.w-full.rounded-xl` — e.g. “z. B. 10b Wirtschaft (dialog "Klasse erstellen")”
- Problem: computed font-size 15px (< 16px → iOS Safari zooms the page on focus)
- Suggested fix: Use `text-base` (16px) on inputs at mobile widths (e.g. `text-base sm:text-sm`) to prevent iOS zoom-on-focus. Measured 15px.
- File: `components/ui/input.tsx`

**#6** — Input font-size < 16px
- Route: shared — classes-student
- Width(s): 320, 360, 375, 390, 430, 667x375 · theme: light
- Element: `div.space-y-1.5 > div.flex.flex-col.gap-2 > input#join-code.min-h-11.w-full.rounded-xl` — e.g. “z. B. AB12CD34 (dialog "Mehr")”
- Problem: computed font-size 15px (< 16px → iOS Safari zooms the page on focus)
- Suggested fix: Use `text-base` (16px) on inputs at mobile widths (e.g. `text-base sm:text-sm`) to prevent iOS zoom-on-focus. Measured 15px.
- File: `components/ui/input.tsx`

**#7** — Touch target < 44px
- Route: shared — friends
- Width(s): 320, 360, 375, 390, 430, 667x375, 844x390 · theme: light/dark
- Element: `div.panel.card-interactive.h-full > div.flex.items-center.gap-3 > button.flex.h-10.w-10` — e.g. “Marco Bianchi-Fuchsenbergerstein entfern”, “Nora Keller entfernen”
- Problem: interactive element is 40×40px (< 44×44)
- Suggested fix: Increase hit area to >= 44x44px on touch (e.g. `min-h-11 min-w-11`, padding, or an invisible ::after with inset -8px). Measured 40x40.
- File: `app/globals.css`

**#8** — Touch target < 44px
- Route: shared — settings
- Width(s): 320, 360, 375, 390, 430, 667x375, 844x390 · theme: light/dark
- Element: `div.mt-4 > div.inline-flex.max-w-full.gap-1[role=tablist] > button.inline-flex.min-h-9.shrink-0[role=tab]` — e.g. “Dunkel”, “Automatisch”
- Problem: interactive element is 95×36px (< 44×44)
- Suggested fix: Increase hit area to >= 44x44px on touch (e.g. `min-h-11 min-w-11`, padding, or an invisible ::after with inset -8px). Measured 95x36.
- File: `components/ui/theme-toggle.tsx`

**#9** — Input font-size < 16px
- Route: shared — profile
- Width(s): 320, 360, 375, 390, 430, 667x375, 844x390 · theme: light/dark
- Element: `div.grid.gap-5.sm:grid-cols-2 > div.space-y-1.5 > input#profile-linkedIn.min-h-11.w-full.rounded-xl` — e.g. “ (dialog "Mehr")”
- Problem: computed font-size 15px (< 16px → iOS Safari zooms the page on focus)
- Suggested fix: Use `text-base` (16px) on inputs at mobile widths (e.g. `text-base sm:text-sm`) to prevent iOS zoom-on-focus. Measured 15px.
- File: `components/ui/input.tsx`

**#10** — Input font-size < 16px
- Route: shared — profile
- Width(s): 320, 360, 375, 390, 430, 667x375, 844x390 · theme: light/dark
- Element: `div.grid.gap-5.sm:grid-cols-2 > div.space-y-1.5 > input#profile-website.min-h-11.w-full.rounded-xl` — e.g. “ (dialog "Mehr")”
- Problem: computed font-size 15px (< 16px → iOS Safari zooms the page on focus)
- Suggested fix: Use `text-base` (16px) on inputs at mobile widths (e.g. `text-base sm:text-sm`) to prevent iOS zoom-on-focus. Measured 15px.
- File: `components/ui/input.tsx`

**#11** — Input font-size < 16px
- Route: shared — profile
- Width(s): 320, 360, 375, 390, 430, 667x375, 844x390 · theme: light/dark
- Element: `div.grid.gap-5.sm:grid-cols-2 > div.space-y-1.5.sm:col-span-2 > input#profile-location.min-h-11.w-full.rounded-xl` — e.g. “ (dialog "Mehr")”
- Problem: computed font-size 15px (< 16px → iOS Safari zooms the page on focus)
- Suggested fix: Use `text-base` (16px) on inputs at mobile widths (e.g. `text-base sm:text-sm`) to prevent iOS zoom-on-focus. Measured 15px.
- File: `components/ui/input.tsx`

**#12** — Input font-size < 16px
- Route: shared — profile
- Width(s): 320, 360, 375, 390, 430, 667x375, 844x390 · theme: light/dark
- Element: `div.grid.gap-5.sm:grid-cols-2 > div.space-y-1.5 > input#profile-phone.min-h-11.w-full.rounded-xl` — e.g. “ (dialog "Mehr")”
- Problem: computed font-size 15px (< 16px → iOS Safari zooms the page on focus)
- Suggested fix: Use `text-base` (16px) on inputs at mobile widths (e.g. `text-base sm:text-sm`) to prevent iOS zoom-on-focus. Measured 15px.
- File: `components/ui/input.tsx`

**#13** — Input font-size < 16px
- Route: shared — profile
- Width(s): 320, 360, 375, 390, 430, 667x375, 844x390 · theme: light/dark
- Element: `div.grid.gap-5.sm:grid-cols-2 > div.space-y-1.5.sm:col-span-2 > input#profile-email.min-h-11.w-full.rounded-xl` — e.g. “ (dialog "Mehr")”
- Problem: computed font-size 15px (< 16px → iOS Safari zooms the page on focus)
- Suggested fix: Use `text-base` (16px) on inputs at mobile widths (e.g. `text-base sm:text-sm`) to prevent iOS zoom-on-focus. Measured 15px.
- File: `components/ui/input.tsx`

**#14** — Input font-size < 16px
- Route: shared — profile
- Width(s): 320, 360, 375, 390, 430, 667x375, 844x390 · theme: light/dark
- Element: `div.grid.gap-5.sm:grid-cols-2 > div.space-y-1.5 > input#profile-lastName.min-h-11.w-full.rounded-xl` — e.g. “ (dialog "Mehr")”
- Problem: computed font-size 15px (< 16px → iOS Safari zooms the page on focus)
- Suggested fix: Use `text-base` (16px) on inputs at mobile widths (e.g. `text-base sm:text-sm`) to prevent iOS zoom-on-focus. Measured 15px.
- File: `components/ui/input.tsx`

**#15** — Input font-size < 16px
- Route: shared — profile
- Width(s): 320, 360, 375, 390, 430, 667x375, 844x390 · theme: light/dark
- Element: `div.grid.gap-5.sm:grid-cols-2 > div.space-y-1.5 > input#profile-firstName.min-h-11.w-full.rounded-xl` — e.g. “ (dialog "Mehr")”
- Problem: computed font-size 15px (< 16px → iOS Safari zooms the page on focus)
- Suggested fix: Use `text-base` (16px) on inputs at mobile widths (e.g. `text-base sm:text-sm`) to prevent iOS zoom-on-focus. Measured 15px.
- File: `components/ui/input.tsx`

**#16** — Fixed/sticky bar covers content
- Route: shared — applications-new, map
- Width(s): 320, 360, 375, 390, 430, 667x375 · theme: light/dark
- Element: `div.workspace-bg.min-h-[100dvh] > nav.glass-bar.fixed.inset-x-0` — e.g. “end of page: select "SoftwareVertriebWirtscha" 16px; label "Link zur Stelle" 20px”, “end of page: button "GoogleMerken" 51px; span "Merken" 20px; button "Straße -4, 1" 25px; b”, “end of page: button "GoogleMerken" 58px; span "Merken" 20px; button "Straße -4, 1" 44px”
- Problem: end of page: bar (63px high) covers select "SoftwareVertriebWirtscha" 16px; label "Link zur Stelle" 20px
- Suggested fix: Add bottom/top padding to the scroll container equal to the bar height + `env(safe-area-inset-*)`, or make the bar non-sticky; verify with keyboard open (use `dvh`).
- File: `components/layout/workspace-shell.tsx`

**#17** — Input font-size < 16px
- Route: shared — applications-new
- Width(s): 320, 360, 375, 390, 430, 667x375, 844x390 · theme: light/dark
- Element: `div.space-y-5 > div > textarea#_r_b_.w-full.resize-y.rounded-xl` — e.g. “ (dialog "Mehr")”
- Problem: computed font-size 15px (< 16px → iOS Safari zooms the page on focus)
- Suggested fix: Use `text-base` (16px) on inputs at mobile widths (e.g. `text-base sm:text-sm`) to prevent iOS zoom-on-focus. Measured 15px.
- File: `components/ui/input.tsx`

### / (root)

**#18** — Clipped content
- Route: /
- Width(s): 1024, 1280 · theme: light/dark
- Element: `main.workspace-bg.min-h-[100dvh].lg:grid > aside.relative.hidden.overflow-hidden` — e.g. “WendApply Bewerbungen einfach im Blick. ”
- Problem: content 620px wide is cut off in a 524px box (overflow hidden, no ellipsis)
- Suggested fix: Content is cut off by `overflow:hidden` without ellipsis: allow wrapping (`whitespace-normal break-words`), add `truncate` + title, or remove the fixed width/height.
- File: `app/page.tsx`

**#19** — Input font-size < 16px
- Route: /
- Width(s): 320, 360, 375, 390, 430, 667x375, 844x390 · theme: light/dark
- Element: `form.glass-surface.space-y-5.p-5 > div.space-y-1.5 > input#email.min-h-11.w-full.rounded-xl` — e.g. “du@beispiel.ch”
- Problem: computed font-size 15px (< 16px → iOS Safari zooms the page on focus)
- Suggested fix: Use `text-base` (16px) on inputs at mobile widths (e.g. `text-base sm:text-sm`) to prevent iOS zoom-on-focus. Measured 15px.
- File: `app/login/page.tsx`

**#20** — Input font-size < 16px
- Route: /
- Width(s): 320, 360, 375, 390, 430, 667x375, 844x390 · theme: light/dark
- Element: `form.glass-surface.space-y-5.p-5 > div.space-y-1.5 > input#password.min-h-11.w-full.rounded-xl` — e.g. “Dein Passwort”
- Problem: computed font-size 15px (< 16px → iOS Safari zooms the page on focus)
- Suggested fix: Use `text-base` (16px) on inputs at mobile widths (e.g. `text-base sm:text-sm`) to prevent iOS zoom-on-focus. Measured 15px.
- File: `app/login/page.tsx`

### /login (login)

**#21** — Clipped content
- Route: /login
- Width(s): 1024, 1280 · theme: light/dark
- Element: `main.workspace-bg.min-h-[100dvh].lg:grid > aside.relative.hidden.overflow-hidden` — e.g. “WendApply Bewerbungen einfach im Blick. ”
- Problem: content 620px wide is cut off in a 524px box (overflow hidden, no ellipsis)
- Suggested fix: Content is cut off by `overflow:hidden` without ellipsis: allow wrapping (`whitespace-normal break-words`), add `truncate` + title, or remove the fixed width/height.
- File: `app/login/page.tsx`

**#22** — Input font-size < 16px
- Route: /login
- Width(s): 320, 360, 375, 390, 430, 667x375, 844x390 · theme: light/dark
- Element: `form.glass-surface.space-y-5.p-5 > div.space-y-1.5 > input#email.min-h-11.w-full.rounded-xl` — e.g. “du@beispiel.ch”
- Problem: computed font-size 15px (< 16px → iOS Safari zooms the page on focus)
- Suggested fix: Use `text-base` (16px) on inputs at mobile widths (e.g. `text-base sm:text-sm`) to prevent iOS zoom-on-focus. Measured 15px.
- File: `app/login/page.tsx`

**#23** — Input font-size < 16px
- Route: /login
- Width(s): 320, 360, 375, 390, 430, 667x375, 844x390 · theme: light/dark
- Element: `form.glass-surface.space-y-5.p-5 > div.space-y-1.5 > input#password.min-h-11.w-full.rounded-xl` — e.g. “Dein Passwort”
- Problem: computed font-size 15px (< 16px → iOS Safari zooms the page on focus)
- Suggested fix: Use `text-base` (16px) on inputs at mobile widths (e.g. `text-base sm:text-sm`) to prevent iOS zoom-on-focus. Measured 15px.
- File: `app/login/page.tsx`

### /applications (applications)

**#24** — Input font-size < 16px
- Route: /applications
- Width(s): 320, 360, 375, 390, 430, 667x375, 844x390 · theme: light/dark
- Element: `div.mt-7.space-y-3 > label.relative.block > input.min-h-11.w-full.rounded-full` — e.g. “Firma oder Stelle suchen”, “Firma oder Stelle suchen (dialog "Mehr")”
- Problem: computed font-size 15px (< 16px → iOS Safari zooms the page on focus)
- Suggested fix: Use `text-base` (16px) on inputs at mobile widths (e.g. `text-base sm:text-sm`) to prevent iOS zoom-on-focus. Measured 15px.
- File: `app/applications/page.tsx`

### /applications/new (applications-new)

**#25** — Fixed/sticky bar covers content
- Route: /applications/new
- Width(s): 320, 360, 375, 390, 430 · theme: light/dark
- Element: `div.panel.mt-6.p-4 > form.max-w-2xl > div.sticky.bottom-[calc(var(--tabbar-h)+v.z-10` — e.g. “end of page: label "Ort" 20px; input "Zürich oder von zu Hause" 45px; label "Berufsfeld" 2”
- Problem: end of page: bar (133px high) covers label "Ort" 20px; input "Zürich oder von zu Hause" 45px; label "Berufsfeld" 20px
- Suggested fix: Add bottom/top padding to the scroll container equal to the bar height + `env(safe-area-inset-*)`, or make the bar non-sticky; verify with keyboard open (use `dvh`).
- File: `components/applications/application-form.tsx`

**#26** — Input font-size < 16px
- Route: /applications/new
- Width(s): 320, 360, 375, 390, 430, 667x375, 844x390 · theme: light/dark
- Element: `div.grid.gap-5.sm:grid-cols-2 > div > input#_r_3_.min-h-11.w-full.rounded-xl` — e.g. “Zürich oder von zu Hause”, “Zürich oder von zu Hause (dialog "Mehr")”
- Problem: computed font-size 15px (< 16px → iOS Safari zooms the page on focus)
- Suggested fix: Use `text-base` (16px) on inputs at mobile widths (e.g. `text-base sm:text-sm`) to prevent iOS zoom-on-focus. Measured 15px.
- File: `components/applications/application-form.tsx`

**#27** — Input font-size < 16px
- Route: /applications/new
- Width(s): 320, 360, 375, 390, 430, 667x375, 844x390 · theme: light/dark
- Element: `div.grid.gap-5.sm:grid-cols-2 > div > input#_r_5_.min-h-11.w-full.rounded-xl` — e.g. “https://…”, “https://… (dialog "Mehr")”
- Problem: computed font-size 15px (< 16px → iOS Safari zooms the page on focus)
- Suggested fix: Use `text-base` (16px) on inputs at mobile widths (e.g. `text-base sm:text-sm`) to prevent iOS zoom-on-focus. Measured 15px.
- File: `components/applications/application-form.tsx`

**#28** — Input font-size < 16px
- Route: /applications/new
- Width(s): 320, 360, 375, 390, 430, 667x375, 844x390 · theme: light/dark
- Element: `div.grid.gap-5.sm:grid-cols-2 > div > input#_r_6_.min-h-11.w-full.rounded-xl` — e.g. “Zum Beispiel: jobs.ch”, “Zum Beispiel: jobs.ch (dialog "Mehr")”
- Problem: computed font-size 15px (< 16px → iOS Safari zooms the page on focus)
- Suggested fix: Use `text-base` (16px) on inputs at mobile widths (e.g. `text-base sm:text-sm`) to prevent iOS zoom-on-focus. Measured 15px.
- File: `components/applications/application-form.tsx`

**#29** — Input font-size < 16px
- Route: /applications/new
- Width(s): 320, 360, 375, 390, 430, 667x375, 844x390 · theme: light/dark
- Element: `div.grid.gap-5.sm:grid-cols-2 > div > input#_r_7_.min-h-11.w-full.rounded-xl` — e.g. “ (dialog "Mehr")”
- Problem: computed font-size 15px (< 16px → iOS Safari zooms the page on focus)
- Suggested fix: Use `text-base` (16px) on inputs at mobile widths (e.g. `text-base sm:text-sm`) to prevent iOS zoom-on-focus. Measured 15px.
- File: `app/applications/new/page.tsx`

**#30** — Input font-size < 16px
- Route: /applications/new
- Width(s): 320, 360, 375, 390, 430, 667x375, 844x390 · theme: light/dark
- Element: `div.grid.gap-5.sm:grid-cols-2 > div > select#_r_4_.min-h-11.sm:min-h-11.w-full` — e.g. “SoftwareVertriebWirtschaftFinanzenBankBe”, “SoftwareVertriebWirtschaftFinanzenBankBe (dialog "Mehr")”
- Problem: computed font-size 15px (< 16px → iOS Safari zooms the page on focus)
- Suggested fix: Use `text-base` (16px) on inputs at mobile widths (e.g. `text-base sm:text-sm`) to prevent iOS zoom-on-focus. Measured 15px.
- File: `app/applications/[id]/page.tsx`

**#31** — Input font-size < 16px
- Route: /applications/new
- Width(s): 320, 360, 375, 390, 430, 667x375, 844x390 · theme: light/dark
- Element: `div.grid.gap-5.sm:grid-cols-3 > div > input#_r_8_.min-h-11.w-full.rounded-xl` — e.g. “65000”, “65000 (dialog "Mehr")”
- Problem: computed font-size 15px (< 16px → iOS Safari zooms the page on focus)
- Suggested fix: Use `text-base` (16px) on inputs at mobile widths (e.g. `text-base sm:text-sm`) to prevent iOS zoom-on-focus. Measured 15px.
- File: `components/applications/application-form.tsx`

**#32** — Input font-size < 16px
- Route: /applications/new
- Width(s): 320, 360, 375, 390, 430, 667x375, 844x390 · theme: light/dark
- Element: `div.grid.gap-5.sm:grid-cols-3 > div > input#_r_9_.min-h-11.w-full.rounded-xl` — e.g. “80000”, “80000 (dialog "Mehr")”
- Problem: computed font-size 15px (< 16px → iOS Safari zooms the page on focus)
- Suggested fix: Use `text-base` (16px) on inputs at mobile widths (e.g. `text-base sm:text-sm`) to prevent iOS zoom-on-focus. Measured 15px.
- File: `components/applications/application-form.tsx`

**#33** — Input font-size < 16px
- Route: /applications/new
- Width(s): 320, 360, 375, 390, 430, 667x375, 844x390 · theme: light/dark
- Element: `div.grid.gap-5.sm:grid-cols-3 > div > input#_r_a_.min-h-11.w-full.rounded-xl` — e.g. “CHF”, “CHF (dialog "Mehr")”
- Problem: computed font-size 15px (< 16px → iOS Safari zooms the page on focus)
- Suggested fix: Use `text-base` (16px) on inputs at mobile widths (e.g. `text-base sm:text-sm`) to prevent iOS zoom-on-focus. Measured 15px.
- File: `app/applications/[id]/page.tsx`

**#34** — Input font-size < 16px
- Route: /applications/new
- Width(s): 320, 360, 375, 390, 430, 667x375, 844x390 · theme: light/dark
- Element: `div.space-y-5 > div > textarea#_r_c_.w-full.resize-y.rounded-xl` — e.g. “Fragen, Ideen oder was du als Nächstes t”, “Fragen, Ideen oder was du als Nächstes t (dialog "Mehr")”
- Problem: computed font-size 15px (< 16px → iOS Safari zooms the page on focus)
- Suggested fix: Use `text-base` (16px) on inputs at mobile widths (e.g. `text-base sm:text-sm`) to prevent iOS zoom-on-focus. Measured 15px.
- File: `components/applications/application-form.tsx`

**#35** — Input font-size < 16px
- Route: /applications/new
- Width(s): 320, 360, 375, 390, 430, 667x375, 844x390 · theme: light/dark
- Element: `fieldset.min-w-0.space-y-5.border-0 > div > input#_r_0_.min-h-11.w-full.rounded-xl` — e.g. “Zum Beispiel: Migros”, “Zum Beispiel: Migros (dialog "Mehr")”
- Problem: computed font-size 15px (< 16px → iOS Safari zooms the page on focus)
- Suggested fix: Use `text-base` (16px) on inputs at mobile widths (e.g. `text-base sm:text-sm`) to prevent iOS zoom-on-focus. Measured 15px.
- File: `components/applications/application-form.tsx`

**#36** — Input font-size < 16px
- Route: /applications/new
- Width(s): 320, 360, 375, 390, 430, 667x375, 844x390 · theme: light/dark
- Element: `fieldset.min-w-0.space-y-5.border-0 > div > input#_r_1_.min-h-11.w-full.rounded-xl` — e.g. “Zum Beispiel: Mediamatiker:in”, “Zum Beispiel: Mediamatiker:in (dialog "Mehr")”
- Problem: computed font-size 15px (< 16px → iOS Safari zooms the page on focus)
- Suggested fix: Use `text-base` (16px) on inputs at mobile widths (e.g. `text-base sm:text-sm`) to prevent iOS zoom-on-focus. Measured 15px.
- File: `components/applications/application-form.tsx`

**#37** — Input font-size < 16px
- Route: /applications/new
- Width(s): 320, 360, 375, 390, 430, 667x375, 844x390 · theme: light/dark
- Element: `fieldset.min-w-0.space-y-5.border-0 > div > select#_r_2_.min-h-11.sm:min-h-11.w-full` — e.g. “Merken Vorbereiten Abgeschickt Gespräch ”, “Merken Vorbereiten Abgeschickt Gespräch  (dialog "Mehr")”
- Problem: computed font-size 15px (< 16px → iOS Safari zooms the page on focus)
- Suggested fix: Use `text-base` (16px) on inputs at mobile widths (e.g. `text-base sm:text-sm`) to prevent iOS zoom-on-focus. Measured 15px.
- File: `app/applications/[id]/page.tsx`

### /applications/a1 (applications-detail)

**#38** — Input font-size < 16px
- Route: /applications/a1
- Width(s): 320, 360, 375, 390, 430, 667x375, 844x390 · theme: light/dark
- Element: `div.mt-4.flex.flex-col > div.flex.items-center.gap-2 > select#application-status.min-h-11.sm:min-h-11.min-w-0` — e.g. “Merken Vorbereiten Abgeschickt Gespräch ”, “Merken Vorbereiten Abgeschickt Gespräch  (dialog "Bewerbung löschen")”, “Merken Vorbereiten Abgeschickt Gespräch  (dialog "Mehr")”
- Problem: computed font-size 15px (< 16px → iOS Safari zooms the page on focus)
- Suggested fix: Use `text-base` (16px) on inputs at mobile widths (e.g. `text-base sm:text-sm`) to prevent iOS zoom-on-focus. Measured 15px.
- File: `app/applications/[id]/page.tsx`

### /map (map)

**#39** — Map touch behaviour (canvas-height)
- Route: /map
- Width(s): 667x375, 844x390 · theme: light/dark
- Element: `div.map-module__PGB0-a__page.pb-safe > section.map-module__PGB0-a__map > div.map-module__PGB0-a__canvasHost[role=region]` — e.g. “canvas-height”
- Problem: map canvas host is 420px tall in a 375px viewport (map fills the whole screen, page cannot be scrolled past it by touch)
- Suggested fix: Set `touch-action: none` on the canvas, `overscroll-behavior: contain` on its host, and keep the canvas height <= ~70dvh so the page stays scrollable.
- File: `app/map/page.tsx`

**#40** — Clipped content
- Route: /map
- Width(s): 320, 375, 390 · theme: light/dark
- Element: `section.map-module__PGB0-a__map > div.map-module__PGB0-a__canvasHost[role=region] > div.map-module__PGB0-a__worldLabel` — e.g. “Swisscom (Schweiz) AG Gespräch UBS Busin”
- Problem: content 299px wide is cut off in a 294px box (overflow hidden, no ellipsis)
- Suggested fix: Content is cut off by `overflow:hidden` without ellipsis: allow wrapping (`whitespace-normal break-words`), add `truncate` + title, or remove the fixed width/height.
- File: `app/map/page.tsx`

**#41** — Touch target < 44px
- Route: /map
- Width(s): 320, 360, 375, 390, 430, 667x375 · theme: light/dark
- Element: `div.map-module__PGB0-a__canvasHost[role=region] > div.map-module__PGB0-a__worldLabel > button.map-module__PGB0-a__worldLabel` — e.g. “Swisscom (Schweiz) AG: Gespräch. Gebäude”, “UBS Business Solutions AG: Abgeschickt. ”, “Migros-Genossenschafts-Bund Informations”
- Problem: interactive element is 108×40px (< 44×44)
- Suggested fix: Increase hit area to >= 44x44px on touch (e.g. `min-h-11 min-w-11`, padding, or an invisible ::after with inset -8px). Measured 108x40.
- File: `app/map/page.tsx`

**#42** — Touch target < 44px
- Route: /map
- Width(s): 844x390 · theme: light/dark
- Element: `div.map-module__PGB0-a__toolbar > div.map-module__PGB0-a__tools > button` — e.g. “Verkleinern”, “Vergrößern”, “Kamera zentrieren”
- Problem: interactive element is 40×40px (< 44×44)
- Suggested fix: Increase hit area to >= 44x44px on touch (e.g. `min-h-11 min-w-11`, padding, or an invisible ::after with inset -8px). Measured 40x40.
- File: `app/map/page.tsx`

**#43** — Touch target < 44px
- Route: /map
- Width(s): 844x390 · theme: light/dark
- Element: `div.map-module__PGB0-a__toolbar > div.map-module__PGB0-a__tools > button.map-module__PGB0-a__zoom` — e.g. “Zoom zurücksetzen”
- Problem: interactive element is 78×40px (< 44×44)
- Suggested fix: Increase hit area to >= 44x44px on touch (e.g. `min-h-11 min-w-11`, padding, or an invisible ::after with inset -8px). Measured 78x40.
- File: `app/map/page.tsx`

**#44** — Touch target < 44px
- Route: /map
- Width(s): 667x375, 844x390 · theme: light/dark
- Element: `header.animate-rise.mb-6.flex > div.flex.shrink-0.flex-wrap > a.inline-flex.items-center.justify-center` — e.g. “Bewerbung”
- Problem: interactive element is 133×40px (< 44×44)
- Suggested fix: Increase hit area to >= 44x44px on touch (e.g. `min-h-11 min-w-11`, padding, or an invisible ::after with inset -8px). Measured 133x40.
- File: `app/map/page.tsx`

**#45** — Touch target < 44px
- Route: /map
- Width(s): 667x375 · theme: light/dark
- Element: `header.animate-rise.mb-6.flex > div.flex.shrink-0.flex-wrap > button.inline-flex.items-center.justify-center` — e.g. “Shop · 340”
- Problem: interactive element is 133×40px (< 44×44)
- Suggested fix: Increase hit area to >= 44x44px on touch (e.g. `min-h-11 min-w-11`, padding, or an invisible ::after with inset -8px). Measured 133x40.
- File: `app/map/page.tsx`

### /profile (profile)

**#46** — Touch target < 44px
- Route: /profile
- Width(s): 667x375, 844x390 · theme: light/dark
- Element: `div.panel.animate-rise > form.p-5.sm:p-7 > button.inline-flex.items-center.justify-center` — e.g. “Änderungen speichern”
- Problem: interactive element is 188×40px (< 44×44)
- Suggested fix: Increase hit area to >= 44x44px on touch (e.g. `min-h-11 min-w-11`, padding, or an invisible ::after with inset -8px). Measured 188x40.
- File: `app/profile/page.tsx`

## GROUP2 social (classes*, teacher overview, friends, invite)

24 defects.

### /friends (friends)

**#47** — Horizontal overflow
- Route: /friends
- Width(s): 320, 360, 375, 390, 430 · theme: light/dark
- Element: `html` — e.g. “document scrollWidth exceeds viewport by 136px (offender not isolated)”, “document scrollWidth exceeds viewport by 96px (offender not isolated)”, “document scrollWidth exceeds viewport by 81px (offender not isolated)”
- Problem: document scrollWidth exceeds viewport by 136px (offender not isolated)
- Suggested fix: Add `min-w-0` to the flex/grid child, `break-words`/`[overflow-wrap:anywhere]` for long German words, `flex-wrap`, or wrap wide content in `overflow-x-auto`; ensure widths use `max-w-full`.
- File: `app/friends/page.tsx`

**#48** — Touch target < 44px
- Route: /friends
- Width(s): 320, 360, 375, 390, 430, 667x375, 844x390 · theme: light/dark
- Element: `div.flex.flex-wrap.items-center > div.flex.gap-2 > button.inline-flex.items-center.justify-center` — e.g. “Annehmen”, “Ablehnen”
- Problem: interactive element is 118×36px (< 44×44)
- Suggested fix: Increase hit area to >= 44x44px on touch (e.g. `min-h-11 min-w-11`, padding, or an invisible ::after with inset -8px). Measured 118x36.
- File: `components/friends/requests.tsx`

**#49** — Touch target < 44px
- Route: /friends
- Width(s): 667x375, 844x390 · theme: light/dark
- Element: `div.p-4.sm:p-5.md:p-6 > div.grid.grid-cols-2.gap-2 > a.inline-flex.items-center.justify-center` — e.g. “Per E-Mail”
- Problem: interactive element is 127×40px (< 44×44)
- Suggested fix: Increase hit area to >= 44x44px on touch (e.g. `min-h-11 min-w-11`, padding, or an invisible ::after with inset -8px). Measured 127x40.
- File: `components/classes/class-settings.tsx`

**#50** — Touch target < 44px
- Route: /friends
- Width(s): 667x375, 844x390 · theme: light/dark
- Element: `div.p-4.sm:p-5.md:p-6 > div.grid.grid-cols-2.gap-2 > button.inline-flex.items-center.justify-center` — e.g. “Code kopieren”, “Link kopieren”, “Teilen”
- Problem: interactive element is 96×40px (< 44×44)
- Suggested fix: Increase hit area to >= 44x44px on touch (e.g. `min-h-11 min-w-11`, padding, or an invisible ::after with inset -8px). Measured 96x40.
- File: `components/friends/invite-card.tsx`

**#51** — Touch target < 44px
- Route: /friends
- Width(s): 667x375, 844x390 · theme: light/dark
- Element: `div.p-4.sm:p-5.md:p-6 > form.mt-3.space-y-3 > button.inline-flex.items-center.justify-center` — e.g. “Anfrage senden”
- Problem: interactive element is 585×40px (< 44×44)
- Suggested fix: Increase hit area to >= 44x44px on touch (e.g. `min-h-11 min-w-11`, padding, or an invisible ::after with inset -8px). Measured 585x40.
- File: `components/friends/add-friend.tsx`

**#52** — Touch target < 44px
- Route: /friends
- Width(s): 320, 360, 375, 390, 430, 667x375, 844x390 · theme: light/dark
- Element: `div.panel.animate-rise.p-4 > div.flex.items-center.gap-3 > button.relative.h-7.w-12[role=switch]` — e.g. “Aktivität mit Freunden teilen”
- Problem: interactive element is 48×28px (< 44×44)
- Suggested fix: Increase hit area to >= 44x44px on touch (e.g. `min-h-11 min-w-11`, padding, or an invisible ::after with inset -8px). Measured 48x28.
- File: `components/friends/friends-view.tsx`

**#53** — Touch target < 44px
- Route: /friends
- Width(s): 320, 360, 375, 390, 430, 667x375, 844x390 · theme: light/dark
- Element: `div.panel.divide-y.divide-[var(--line)] > div.flex.flex-wrap.items-center > button.inline-flex.items-center.justify-center` — e.g. “Zurückziehen”
- Problem: interactive element is 121×36px (< 44×44)
- Suggested fix: Increase hit area to >= 44x44px on touch (e.g. `min-h-11 min-w-11`, padding, or an invisible ::after with inset -8px). Measured 121x36.
- File: `components/friends/requests.tsx`

**#54** — Input font-size < 16px
- Route: /friends
- Width(s): 320, 360, 375, 390, 430, 667x375, 844x390 · theme: light/dark
- Element: `form.mt-3.space-y-3 > div.space-y-1.5 > input#friend-entry.min-h-11.w-full.rounded-xl` — e.g. “z. B. K7P2QXMA oder name@mail.de”, “z. B. K7P2QXMA oder name@mail.de (dialog "Marco Bianchi-Fuchse")”, “z. B. K7P2QXMA oder name@mail.de (dialog "Nora Keller entferne")”
- Problem: computed font-size 15px (< 16px → iOS Safari zooms the page on focus)
- Suggested fix: Use `text-base` (16px) on inputs at mobile widths (e.g. `text-base sm:text-sm`) to prevent iOS zoom-on-focus. Measured 15px.
- File: `components/friends/add-friend.tsx`

### /invite/LENA-4821 (invite)

**#55** — Touch target < 44px
- Route: /invite/LENA-4821
- Width(s): 320, 360, 375, 390, 430, 667x375, 844x390 · theme: light/dark
- Element: `div.panel.animate-rise.mx-auto > div.mt-6.w-full.space-y-3 > a.block.text-small.text-muted` — e.g. “Später”
- Problem: interactive element is 246×19px (< 44×44)
- Suggested fix: Increase hit area to >= 44x44px on touch (e.g. `min-h-11 min-w-11`, padding, or an invisible ::after with inset -8px). Measured 246x19.
- File: `app/invite/[code]/page.tsx`

### /invite/LENA-4821 (invite-loggedout)

**#56** — Clipped content
- Route: /invite/LENA-4821
- Width(s): 1024, 1280 · theme: light/dark
- Element: `main.workspace-bg.min-h-[100dvh].lg:grid > aside.relative.hidden.overflow-hidden` — e.g. “WendApply Bewerbungen einfach im Blick. ”
- Problem: content 620px wide is cut off in a 524px box (overflow hidden, no ellipsis)
- Suggested fix: Content is cut off by `overflow:hidden` without ellipsis: allow wrapping (`whitespace-normal break-words`), add `truncate` + title, or remove the fixed width/height.
- File: `app/invite/[code]/page.tsx`

**#57** — Input font-size < 16px
- Route: /invite/LENA-4821
- Width(s): 320, 360, 375, 390, 430, 667x375, 844x390 · theme: light/dark
- Element: `form.glass-surface.space-y-5.p-5 > div.space-y-1.5 > input#email.min-h-11.w-full.rounded-xl` — e.g. “du@beispiel.ch”
- Problem: computed font-size 15px (< 16px → iOS Safari zooms the page on focus)
- Suggested fix: Use `text-base` (16px) on inputs at mobile widths (e.g. `text-base sm:text-sm`) to prevent iOS zoom-on-focus. Measured 15px.
- File: `app/login/page.tsx`

**#58** — Input font-size < 16px
- Route: /invite/LENA-4821
- Width(s): 320, 360, 375, 390, 430, 667x375, 844x390 · theme: light/dark
- Element: `form.glass-surface.space-y-5.p-5 > div.space-y-1.5 > input#password.min-h-11.w-full.rounded-xl` — e.g. “Dein Passwort”
- Problem: computed font-size 15px (< 16px → iOS Safari zooms the page on focus)
- Suggested fix: Use `text-base` (16px) on inputs at mobile widths (e.g. `text-base sm:text-sm`) to prevent iOS zoom-on-focus. Measured 15px.
- File: `app/login/page.tsx`

### /classes (classes-student)

**#59** — Touch target < 44px
- Route: /classes
- Width(s): 320, 360, 375, 390, 430, 667x375, 844x390 · theme: light/dark
- Element: `div.panel.space-y-3.p-5 > div.flex.flex-wrap.gap-2 > button.inline-flex.items-center.justify-center` — e.g. “Freigabe pausieren”, “Klasse verlassen”
- Problem: interactive element is 164×36px (< 44×44)
- Suggested fix: Increase hit area to >= 44x44px on touch (e.g. `min-h-11 min-w-11`, padding, or an invisible ::after with inset -8px). Measured 164x36.
- File: `components/classes/student-classes.tsx`

**#60** — Input font-size < 16px
- Route: /classes
- Width(s): 320, 360, 375, 390, 430, 667x375, 844x390 · theme: light/dark
- Element: `div.space-y-1.5 > div.flex.flex-col.gap-2 > input#join-code.min-h-11.w-full.rounded-xl` — e.g. “z. B. AB12CD34”
- Problem: computed font-size 15px (< 16px → iOS Safari zooms the page on focus)
- Suggested fix: Use `text-base` (16px) on inputs at mobile widths (e.g. `text-base sm:text-sm`) to prevent iOS zoom-on-focus. Measured 15px.
- File: `components/classes/student-classes.tsx`

### /classes (classes-teacher)

**#61** — Touch target < 44px
- Route: /classes
- Width(s): 320, 360, 375, 390, 430, 667x375, 844x390 · theme: light/dark
- Element: `div > div.flex.flex-wrap.items-center > button.inline-flex.items-center.justify-center` — e.g. “Kopieren”, “Teilen”
- Problem: interactive element is 90×36px (< 44×44)
- Suggested fix: Increase hit area to >= 44x44px on touch (e.g. `min-h-11 min-w-11`, padding, or an invisible ::after with inset -8px). Measured 90x36.
- File: `components/classes/shared.tsx`

**#62** — Touch target < 44px
- Route: /classes
- Width(s): 320, 360, 375, 390, 430, 667x375, 844x390 · theme: light/dark
- Element: `div.grid.gap-4.md:grid-cols-2 > div.panel.space-y-4.p-5 > a.flex.items-start.justify-between` — e.g. “Mediamatik 3b Schuljahr 2026/27 · 0 Schü”, “Informatik 4a Applikationsentwicklung Be”
- Problem: interactive element is 254×42px (< 44×44)
- Suggested fix: Increase hit area to >= 44x44px on touch (e.g. `min-h-11 min-w-11`, padding, or an invisible ::after with inset -8px). Measured 254x42.
- File: `components/classes/teacher-classes.tsx`

**#63** — Touch target < 44px
- Route: /classes
- Width(s): 667x375, 844x390 · theme: light/dark
- Element: `header.animate-rise.mb-6.flex > div.flex.shrink-0.flex-wrap > button.inline-flex.items-center.justify-center` — e.g. “Klasse erstellen”
- Problem: interactive element is 163×40px (< 44×44)
- Suggested fix: Increase hit area to >= 44x44px on touch (e.g. `min-h-11 min-w-11`, padding, or an invisible ::after with inset -8px). Measured 163x40.
- File: `components/classes/teacher-classes.tsx`

### /classes/c1 (classes-detail-teacher)

**#64** — Touch target < 44px
- Route: /classes/c1
- Width(s): 320, 360, 375, 390, 430, 667x375, 844x390 · theme: light/dark
- Element: `div.flex.flex-col.gap-3 > div.inline-flex.max-w-full.gap-1[role=tablist] > button.inline-flex.min-h-9.shrink-0[role=tab]` — e.g. “Wenigste Aktivität”, “Meiste Bewerbungen”
- Problem: interactive element is 152×36px (< 44×44)
- Suggested fix: Increase hit area to >= 44x44px on touch (e.g. `min-h-11 min-w-11`, padding, or an invisible ::after with inset -8px). Measured 152x36.
- File: `components/classes/class-detail.tsx`

**#65** — Input font-size < 16px
- Route: /classes/c1
- Width(s): 320, 360, 375, 390, 430, 667x375, 844x390 · theme: light/dark
- Element: `div.flex.flex-col.gap-3 > div.relative.sm:max-w-xs.sm:flex-1 > input.min-h-11.w-full.rounded-xl` — e.g. “Schüler oder Firma suchen”, “Schüler oder Firma suchen (dialog "Mehr")”
- Problem: computed font-size 15px (< 16px → iOS Safari zooms the page on focus)
- Suggested fix: Use `text-base` (16px) on inputs at mobile widths (e.g. `text-base sm:text-sm`) to prevent iOS zoom-on-focus. Measured 15px.
- File: `components/classes/class-detail.tsx`

**#66** — Touch target < 44px
- Route: /classes/c1
- Width(s): 320, 360, 375, 390, 430, 667x375, 844x390 · theme: light/dark
- Element: `div.panel.flex.flex-wrap > div.flex.flex-wrap.items-center > button.inline-flex.items-center.justify-center` — e.g. “Kopieren”, “Teilen”
- Problem: interactive element is 90×36px (< 44×44)
- Suggested fix: Increase hit area to >= 44x44px on touch (e.g. `min-h-11 min-w-11`, padding, or an invisible ::after with inset -8px). Measured 90x36.
- File: `components/classes/shared.tsx`

**#67** — Touch target < 44px
- Route: /classes/c1
- Width(s): 667x375, 844x390 · theme: light/dark
- Element: `header.animate-rise.mb-6.flex > div.flex.shrink-0.flex-wrap > button.inline-flex.items-center.justify-center` — e.g. “Verwalten”
- Problem: interactive element is 126×40px (< 44×44)
- Suggested fix: Increase hit area to >= 44x44px on touch (e.g. `min-h-11 min-w-11`, padding, or an invisible ::after with inset -8px). Measured 126x40.
- File: `components/classes/class-detail.tsx`

**#68** — Touch target < 44px
- Route: /classes/c1
- Width(s): 320, 360, 375, 390, 430, 667x375, 844x390 · theme: light/dark
- Element: `main#main.page-wrap.pb-safe.pt-6 > div.space-y-6.pb-safe > a.text-small.inline-flex.items-center` — e.g. “Alle Klassen”
- Problem: interactive element is 93×19px (< 44×44)
- Suggested fix: Increase hit area to >= 44x44px on touch (e.g. `min-h-11 min-w-11`, padding, or an invisible ::after with inset -8px). Measured 93x19.
- File: `components/classes/class-detail.tsx`

**#69** — Touch target < 44px
- Route: /classes/c1
- Width(s): 844x390 · theme: light/dark
- Element: `tr.border-b.border-[var(--line)].last:border-0 > th.px-4.py-3.font-medium > button.inline-flex.items-center.gap-2.5` — e.g. “CR Chiara Rossi”, “BH Ben Huber”, “DF David Frei”
- Problem: interactive element is 90×24px (< 44×44)
- Suggested fix: Increase hit area to >= 44x44px on touch (e.g. `min-h-11 min-w-11`, padding, or an invisible ::after with inset -8px). Measured 90x24.
- File: `components/classes/class-detail.tsx`

### /classes/join/KLAS-7Q2 (classes-join)

**#70** — Touch target < 44px
- Route: /classes/join/KLAS-7Q2
- Width(s): 667x375, 844x390 · theme: light/dark
- Element: `div.panel.animate-rise.mx-auto > div.space-y-3.text-left > a.inline-flex.items-center.justify-center` — e.g. “Nicht jetzt”
- Problem: interactive element is 382×40px (< 44×44)
- Suggested fix: Increase hit area to >= 44x44px on touch (e.g. `min-h-11 min-w-11`, padding, or an invisible ::after with inset -8px). Measured 382x40.
- File: `app/classes/join/[code]/page.tsx`

## GROUP3 (settings, cvs, search, analytics)

8 defects.

### /settings (settings)

**#71** — Touch target < 44px
- Route: /settings
- Width(s): 320, 360, 375, 390, 430, 667x375, 844x390 · theme: light/dark
- Element: `div.mt-4 > div.inline-flex.max-w-full.gap-1[role=tablist] > button.inline-flex.min-h-9.shrink-0[role=tab]` — e.g. “Hell”
- Problem: interactive element is 74×36px (< 44×44)
- Suggested fix: Increase hit area to >= 44x44px on touch (e.g. `min-h-11 min-w-11`, padding, or an invisible ::after with inset -8px). Measured 74x36.
- File: `app/settings/page.tsx`

**#72** — Touch target < 44px
- Route: /settings
- Width(s): 667x375, 844x390 · theme: light/dark
- Element: `div.p-4.sm:p-5.md:p-6 > div.mt-4.flex.flex-col > button.inline-flex.items-center.justify-center` — e.g. “Herunterladen”, “Sicherung einlesen”
- Problem: interactive element is 154×40px (< 44×44)
- Suggested fix: Increase hit area to >= 44x44px on touch (e.g. `min-h-11 min-w-11`, padding, or an invisible ::after with inset -8px). Measured 154x40.
- File: `app/settings/page.tsx`

**#73** — Touch target < 44px
- Route: /settings
- Width(s): 667x375, 844x390 · theme: light/dark
- Element: `div.panel.animate-rise.mt-4 > div.p-4.sm:p-5.md:p-6 > button.inline-flex.items-center.justify-center` — e.g. “Meine Daten löschen”
- Problem: interactive element is 202×40px (< 44×44)
- Suggested fix: Increase hit area to >= 44x44px on touch (e.g. `min-h-11 min-w-11`, padding, or an invisible ::after with inset -8px). Measured 202x40.
- File: `app/settings/page.tsx`

### /cvs (cvs)

**#74** — Horizontal overflow
- Route: /cvs
- Width(s): 320, 360, 375, 390, 430 · theme: light/dark
- Element: `html` — e.g. “document scrollWidth exceeds viewport by 226px (offender not isolated)”, “document scrollWidth exceeds viewport by 186px (offender not isolated)”, “document scrollWidth exceeds viewport by 171px (offender not isolated)”
- Problem: document scrollWidth exceeds viewport by 226px (offender not isolated)
- Suggested fix: Add `min-w-0` to the flex/grid child, `break-words`/`[overflow-wrap:anywhere]` for long German words, `flex-wrap`, or wrap wide content in `overflow-x-auto`; ensure widths use `max-w-full`.
- File: `app/cvs/page.tsx`

**#75** — Touch target < 44px
- Route: /cvs
- Width(s): 667x375, 844x390 · theme: light/dark
- Element: `div.panel.card-interactive.animate-rise > div.mt-auto.flex.flex-wrap > button.inline-flex.items-center.justify-center` — e.g. “Ersetzen”, “Datei auswählen”
- Problem: interactive element is 115×40px (< 44×44)
- Suggested fix: Increase hit area to >= 44x44px on touch (e.g. `min-h-11 min-w-11`, padding, or an invisible ::after with inset -8px). Measured 115x40.
- File: `app/cvs/page.tsx`

### /search (search)

**#76** — Input font-size < 16px
- Route: /search
- Width(s): 320, 360, 375, 390, 430, 667x375, 844x390 · theme: light/dark
- Element: `div.grid.gap-4.sm:grid-cols-[1.3fr_1fr] > label > input.min-h-11.w-full.rounded-xl` — e.g. “Zum Beispiel: Informatiker”, “Zum Beispiel: Zürich”, “Zum Beispiel: Informatiker (dialog "Mehr")”
- Problem: computed font-size 15px (< 16px → iOS Safari zooms the page on focus)
- Suggested fix: Use `text-base` (16px) on inputs at mobile widths (e.g. `text-base sm:text-sm`) to prevent iOS zoom-on-focus. Measured 15px.
- File: `app/search/page.tsx`

**#77** — Touch target < 44px
- Route: /search
- Width(s): 320, 360, 375, 390, 430, 667x375, 844x390 · theme: light/dark
- Element: `fieldset > div.inline-flex.max-w-full.gap-1[role=tablist] > button.inline-flex.min-h-9.shrink-0[role=tab]` — e.g. “Lehrstelle”, “Job”
- Problem: interactive element is 53×36px (< 44×44)
- Suggested fix: Increase hit area to >= 44x44px on touch (e.g. `min-h-11 min-w-11`, padding, or an invisible ::after with inset -8px). Measured 53x36.
- File: `app/search/page.tsx`

**#78** — Touch target < 44px
- Route: /search
- Width(s): 667x375, 844x390 · theme: light/dark
- Element: `form#search-filters.block.mt-5.max-w-3xl > div.panel.space-y-5.p-5 > button.inline-flex.items-center.justify-center` — e.g. “Stellen suchen”
- Problem: interactive element is 157×40px (< 44×44)
- Suggested fix: Increase hit area to >= 44x44px on touch (e.g. `min-h-11 min-w-11`, padding, or an invisible ::after with inset -8px). Measured 157x40.
- File: `app/search/page.tsx`
