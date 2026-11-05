# Test report v2 (Part D)

Date 2026-11-05, branch `tests-v2`, dev server `next dev --webpack -p 3204`, dummy Supabase env.

## Results

| Suite | Result |
|---|---|
| `npm test` (node --test) | 99 tests, 99 pass (84 existing + 9 lib-pure + 6 migrations) |
| `npm run test:e2e` non-map (`--skip=map`) | 1st run 573 PASS, 13 FAIL, 4 KNOWN, 4 SKIP; the 13 failures were test-script issues (timing, `tab` role for filters, hidden mobile card duplicates, expected 400 from the mock), fixed -> 0 FAIL |
| map section (`--only=map`) | 58 PASS, 0 FAIL, 2 SKIP (mobile: no "Haus verschieben" button visible) |

Screenshots: `~/Projects/bewerbungen-tracker-wt/screenshots/v2/tests/` (summary.json there).

Final full run (desktop+mobile x light+dark, all flows incl. map): 657 PASS, 1 FAIL, 4 KNOWN (BUG-1), 6 SKIP of 668 checks. The 1 FAIL (`login`, hydration warning) was a test artifact: Playwright screenshots inject `caret-color:transparent` into inputs while React hydrates; fixed with `caret: "initial"` and re-run 3x green.

## Findings (app bugs)

### BUG-1: after saving an edit the application detail page stays in edit mode
* Repro: open `/applications/<id>`, click "Ändern", change "Firma", click "Änderungen speichern".
* Expected: detail view is shown again with the new data. Actual: the form is still shown (data is saved).
* Root cause: `components/applications/application-form.tsx` does `router.push('/applications/<id>')` which is the URL the user is already on; `app/applications/[id]/page.tsx` keeps its local `editing` state (`useState(false)` -> `setEditing(true)`), so nothing resets it.
* Fix suggestion (owned by Part A, not changed here): give the form an `onSaved` callback that calls `setEditing(false)` + reloads the application, or keep editing in the URL (`?edit=1`).
* E2E: reported as `KNOWN` (not a failure) by `t.known(..., "BUG-1")`; turns into PASS once fixed.

### Observation: delete has no undo
`delete + undo` is SKIPPED on every run: the app confirms in a dialog and offers no undo toast. If Part A adds undo, the flow will start verifying it automatically.

### Test-environment notes (not app bugs)
* Console "Failed to load resource ... 400/401/404" lines are produced by deliberate error-path flows (bad join code, anonymous redirect, 404 page) and are whitelisted per flow with `t.expect`.
* First request after starting `next dev` can take > 10 s (compile); the flows wait for URL/rows instead of fixed sleeps.

## data-testid attributes added to app source
None.

## Migrations needed
None (tests only).
