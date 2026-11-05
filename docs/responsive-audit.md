# Responsive audit

Generated 2026-11-05 00:21 by `scripts/responsive-audit.mjs` (phase `after`).

Matrix: 19 routes × 11 viewports (320, 360, 375, 390, 430, 667x375, 844x390, 768, 820, 1024, 1280) × themes (light, dark). Supabase fully mocked (German fixtures with very long names). Screenshots: `/Users/panat.ruangsri/Projects/bewerbungen-tracker-wt/screenshots/responsive/after`. Machine-readable: `docs/responsive-audit.json`.

Re-run: `node scripts/responsive-audit.mjs --phase after` (builds + starts the app on :3150; add `--dev` for dev server, `--routes /map,/friends`, `--widths 320,375`, `--themes light`, `--base http://localhost:3000` to reuse a running server).

## Summary

| Group | Defects |
|---|---|
| GROUP1 core (layout, nav/tab bar, login, dashboard, applications*, map, profile, shared components) | **0** |
| GROUP2 social (classes*, teacher overview, friends, invite) | **0** |
| GROUP3 (settings, cvs, search, analytics) | **0** |
| **Total** | **0** |

By type: 

Method notes: a defect is one (route, check, selector) aggregated over all widths/themes where it occurs; defects whose source file is a shared component/layout are listed once under GROUP1 `(shared)` with the routes they appear on. Selectors are tag/class paths (no positional index). Source file = best-effort text/class match in the codebase. Tap-target and font-size checks run on phone viewports (≤430 wide portrait and 667×375 / 844×390 landscape) only. Dialog checks open up to 6 opener buttons per page (light theme) and measure the resulting dialog. Dark mode is covered by screenshots and all DOM checks; colour contrast is not computed (review screenshots).

### Map page info

- html overscroll-behavior-y=auto, body=auto

## GROUP1 core (layout, nav/tab bar, login, dashboard, applications*, map, profile, shared components)

0 defects.

## GROUP2 social (classes*, teacher overview, friends, invite)

0 defects.

## GROUP3 (settings, cvs, search, analytics)

0 defects.
