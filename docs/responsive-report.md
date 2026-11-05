# Responsive report (2026-11-04)

Branch `resp-test` = main (incl. lock-streets/drag-items/islands) + resp-audit, resp-core, resp-social, resp-misc.

## Result
Final audit (`scripts/responsive-audit.mjs --phase after`): 19 routes × 11 viewports (320, 360, 375, 390, 430, 667x375, 844x390, 768, 820, 1024, 1280) × light/dark, dialogs opened, Supabase fully mocked: **0 defects** (horizontal overflow 0, tap targets 0, input font-size 0, bar overlaps 0, clipped 0, modals 0, map touch 0).
Screenshots: `~/Projects/bewerbungen-tracker-wt/screenshots/responsive/after/` (560 files; before-state in `.../before/`).

## Defects per area (initial audit → now)
| Area | Found | Fixed | Open |
|---|---|---|---|
| Group 1 core (layout, nav, login, dashboard, applications, map, profile, shared UI) | 46 | 46 (resp-core) + 1 map switcher tap target fixed here | 0 |
| Group 2 social (classes, teacher overview, friends, invite) | 24 | 24 (resp-social) | 0 |
| Group 3 (settings, cvs, search, analytics) | 8 | 8 (resp-misc) | 0 |
| Total | 78 | 78 | 0 |

Fixes made during integration:
- `app/map/islands.module.css`: island switcher buttons `min-height` 36px → 44px.
- `components/ui/tabs.tsx`: merge conflict resolved, kept `min-h-9 pointer-coarse:min-h-11`.
- `scripts/responsive-audit.mjs`: the "bar covers content" probe ignored nothing inside collapsed `<details>` (false positives on /applications/new, /map); it now skips elements where `checkVisibility()` is false.

## Still open / notes
- Colour contrast in dark mode is not computed by the script; review screenshots by eye.
- Real-device checks (iOS keyboard, safe areas, map touch) were headless Chrome only; test on a real iPhone.
- The build needs `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (not ANON_KEY).
- Lint: 0 errors, 3 unused-var warnings in the audit script.

## Re-run
`node scripts/responsive-audit.mjs --phase after` (about 25 min; builds and starts the app on :3150). Options: `--routes /map,/friends`, `--widths 320,375`, `--themes light`, `--no-modals`, `--dev`, `--base <url>`. Writes `docs/responsive-audit.md/.json` and screenshots.
