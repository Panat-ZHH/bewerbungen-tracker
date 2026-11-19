# Onboarding + sign-up flow – requirement check (November 2026)

Checked tree: branch `onb-integ` at **`4060d21`** (after fix loop 2 = merge of onb-fix-n1 `24fb9b8`). Independent targeted re-QA QA-ONB-3, 2026-11-19 (full re-QA of `feec4a1` in QA-ONB-2). This file is meant to be committed later as `docs/release/ONBOARDING-CHECK-2026-11.md`.
Source of the requirements: Panat's original task (`_onboarding/REQUIREMENTS-PANAT.md`), points 1–6 plus Deploy. Orchestrator decisions: `_onboarding/DECISIONS.md` (#1–#16).
Status: **met**, **partly** (works with a known gap, named), **missing**, or **accepted** (deviation decided in DECISIONS).
Evidence paths are relative to `bewerbungen-tracker-wt/_onboarding/`, unless they're repo paths.

**Overall: every requirement is met or accepted. N1 (shared device: a new Google account created on /login received another person's abandoned funnel answers) is fixed and verified in QA-ONB-3.md (verdict CLEAN). Remaining: the release steps D1/D2 and Panat's open points.**

## 1 Sign-up = onboarding first
| # | Requirement | Status | Evidence |
|---|---|---|---|
| 1.1 | «Kostenlos testen» opens a multi-page funnel, not a register form | met | public CTA → `/start` (DECISIONS #4); `qa2/shots/E-390-student-00-weg.png` |
| 1.2 | One question per screen, progress indicator, back/next, big inputs, mobile first, keyboard | met | `qa2/shots/E-390-student-01…11`, «Schritt 10 von 11» + dots, «Zurück»; onb-e2e keyboard-funnel-desktop (INTEGRATE-2: onb-e2e 64/64) |
| 1.3 | Answers survive going back and reloading | met | onb-e2e funnel-resume-and-restart; resume card; `lib/funnel/storage.ts` (localStorage, 14-day TTL) |
| 1.4 | First screen: «Dein Weg – von der Bewerbung bis zum unterschriebenen Lehrvertrag», journey with 6 milestones in village style, animated (reduced motion respected), one «Los geht's» | met | `qa2/shots/E-390-student-00-weg.png`, `E-1280-student-00-weg.png` (whole path visible on phones, QA L3 fixed) |
| 1.5 | Role: Schüler:in, Elternteil; Lehrperson/Schule take a short path with licence info | met / accepted | `E-*-staff-*` shots; no licence/invite code system exists → three real paths (DECISIONS #5) |
| 1.6 | First name, birth year (only what is needed), under-16 handling + parent consent info (revDSG) | met | `E-390-student-03-jahrgang-answered.png` (under-16 note), konto note with `/datenschutz-jugend`, «Was wir speichern» sheet |
| 1.7 | School level / canton / place, job goal (field/profession, start year) | met | `E-*-student-04-schule`, `05-ort`, `06-beruf` |
| 1.8 | Applications per week: slider/choice, sensible default, motivating feedback | met | `E-*-student-07-wochenziel(-answered)`; default 3, range 1–10 server-validated |
| 1.9 | Help wishes (CV, letters, Schnupperlehre, overview, involve parents) | met | `E-*-student-08-hilfe` |
| 1.10 | Optional family/parent invite | met | `E-*-student-09-dabei`, parent `4-kind` |
| 1.11 | «Dein Plan» summary reflecting the answers | met | `qa2/shots/E-390-student-10-plan.png`: «Informatiker:in EFZ ab 2027 · 4 Bewerbungen pro Woche · 7 Tage gratis testen», «Ändern» per row |
| 1.12 | Only the LAST screen asks for e-mail + password or Google + consent, then creates the account | met | `qa2/shots/E-390-student-11-konto.png`; consent gates both; probe D: no sign-up without consent |
| 1.13 | Answers kept client-side; no PII to the server before registration | met | probe D «no PII before signup» PASS, /api/places 0 calls in the default walk (typing a place calls our own non-storing `/api/places`, QA-ONB L7) |
| 1.14 | Answers saved to profile / goal / weekly target right after account creation; nothing asked twice; funnel role = account role | met / accepted | own account: onb-e2e full funnel per role 66/66 (INTEGRATE-3), access A2 «no second question», funnel Google own answers applied (QA-ONB-3 M7). N1 fixed: a new Google account via /login never takes a foreign copy (`qa3/probe-full.log` H1 ×2, marker attacks M1–R4). Accepted (#16): funnel then «Anmelden → Google», or blocked sessionStorage, = answer again |
| 1.15 | Google sign-up (answers saved after the OAuth return) | met (stub, to the boundary) | onb-e2e google-funnel-boundary ×2 (QA-ONB-3), access A2 (INTEGRATE-3); live only in the production smoke |
| 1.16 | E-mail confirmation flow: what the user sees, resend, wrong e-mail fix | met | `qa2/shots/E-390-bestaetigen.png`; onb-e2e confirm same/other browser; callback copy neutral (L5) |
| 1.17 | Existing account: friendly «Du hast schon ein Konto → Anmelden», no enumeration | met | probe D identical page for new vs existing; e2e existing-email-no-enumeration ×2; not_new notice on the funnel's Google path (QA-ONB-3 M8, e2e existing-user-google-on-funnel); no «already registered» e-mail (DECISIONS #7) |
| 1.18 | Abandoned funnels | met / accepted | resume card + 14-day TTL; unconfirmed sign-ups purge script exists, not scheduled (DECISIONS #7/#14, for Panat) |
| 1.19 | Weekly goal feeds the app (dashboard progress) | met | `qa2/shots/H1-…-1280.png` / `E-1280-dashboard-tour-2.png`: «Wochenziel 0 von 4 Bewerbungen diese Woche» |
| 1.20 | «Anmelden» stays separate and simple; existing users go straight in | met | `qa2/shots/G-login-390.png`; /login has no sign-up; old user → no funnel, no auto tour (probe G, see QA-ONB-2 note) |

## 2 Website buttons
| # | Requirement | Status | Evidence |
|---|---|---|---|
| 2.1 | Two buttons «Anmelden» (quiet) + «Kostenlos testen» (primary) in header/hero/pricing/footer/mobile menu on main | met | commit b9730fd; onb-e2e website-two-buttons; «Registrieren» not used on the public site (GLOSSARY, DECISIONS #4) |
| 2.2 | Same change on ux-website (preview only) | met (local branch, needs a rebase before any preview) | REPORT-buttons.md, INTEGRATE.md item 5 |

## 3 In-app guided tour
| # | Requirement | Status | Evidence |
|---|---|---|---|
| 3.1 | Real element highlighted (spotlight + cut-out), auto-scroll, mobile bottom nav + desktop | met | `qa2/shots/E-1280-dashboard-tour-1…3.png`, `E-390-dashboard-tour-*`; tour-e2e 81/81 (INTEGRATE-2) |
| 3.2 | Card with Zurück / Weiter / Überspringen + step indicator | met | shots: «1 / 8», «Weiter», «Tour überspringen» |
| 3.3 | Skip ends at once, never restarts on its own, stored per user in the DB; «Tour wiederholen» in Hilfe/Einstellungen | met | `product_tour_state` + `tour_state_set` (RLS own rows, QA-ONB P6); tour-e2e skip-persists |
| 3.4 | Role-specific tours, stable data-tour attributes, missing element skipped | met / accepted | tour-e2e; Schüler tour has 8 steps when Dokumente applies (DECISIONS #13, L8) |
| 3.5 | Keyboard (Esc, arrows), screen reader, reduced motion | met | tour-e2e keyboard + reduced-motion cases |
| 3.6 | No clash with paywall / trial banner, never blocks required screens | met | probe F: expired trial + `?tour=1` → paywall, 0 tour dialogs |
| 3.7 | Library vs custom evaluated, small bundle, good a11y | met | custom lazy-loaded component (SPEC-DATA A7, DECISIONS #10) |
| 3.8 | Old slideshow post-signup onboarding replaced | met | `funnel_apply` sets `onboarding_tour_completed_at` (old wizard never shown); REPORT-tour.md |

## 4 Quality
| # | Requirement | Status | Evidence |
|---|---|---|---|
| 4.1 | Calm design system + responsive rules (docs/ux) | met | 390 + 1280 shots: one primary per screen, 44 px targets, no overflow |
| 4.2 | Concrete copy, no fluff, German UI, Swiss spelling, «Du» | met | no «ß» in funnel/tour/start/login/callback; QA-ONB-2 copy review |
| 4.3 | Loading + error states on every screen | met | «Einen Moment …», SavingView retry / «Ohne Plan weiter», konto field errors (`E-*-student-konto-errors.png`) |
| 4.4 | Analytics-free unless already present | met | no analytics added (no new network calls in probe D) |

## 5 Security / privacy
| # | Requirement | Status | Evidence |
|---|---|---|---|
| 5.1 | Rate limit + server-side validation of everything (lengths, enums) | met | `funnel_apply` (10/h user, 300/h IP), QA-ONB P4 (all tamper cases rejected), qa2 Q3/Q4 |
| 5.2 | No PII before consent | met | probe D |
| 5.3 | No account enumeration at registration | met (UI) / accepted (GoTrue timing, DECISIONS #14) | probe D identical page |
| 5.4 | CSRF / origin checks | met (not applicable: no new API routes or cookies; Supabase RPC with a bearer JWT) | diff 23521e3..feec4a1 |
| 5.5 | Secure redirects | met | probe B 13/13; `funnelNextPath` allow-list (L2 fixed) |
| 5.6 | RLS unchanged or tightened; migrations additive | met | 20261119100000 + 20261119110000 (create or replace only); QA-ONB P6, qa2 Q5 |
| 5.7 | Minor-protection wording, revDSG note on collected data | met / Datenschutz paragraph for Panat to review (DECISIONS #8) | `screens.tsx:84`, `account.tsx:198`, `docs/legal/datenschutzerklaerung.md` |
| 5.8 | No cross-account data mixing (follows from «no PII» + revDSG) | met | M1 password path (A1/A2, H5, M2), cross-device confirm (H3), N1 new Google account via /login (H1 ×2, M1/M3/R1/R3), tampered marker ×7 (R4) – QA-ONB-3. Residual by design: someone who finishes an OAuth that another person started in the funnel gets those answers (QA-ONB-3 I1) |

## 6 Tests
| # | Requirement | Status | Evidence |
|---|---|---|---|
| 6.1 | Unit + DB tests | met | full npm test 1203/0 (INTEGRATE-3); onb + auth unit 133/133, DB probes 11/11 + 6/6 (QA-ONB-3) |
| 6.2 | Playwright e2e of the full funnel, phone + desktop, every role, back/forward, reload, Google to the boundary, e-mail confirmation | met (stub) | onb-e2e 66/66 first run (INTEGRATE-3), auth subset 22/22 (QA-ONB-3); access e2e 107/107 (INTEGRATE-3) |
| 6.3 | Tour e2e (next/back/skip, skip persists, element missing) | met | tour-e2e 81/81 |
| 6.4 | Login unaffected | met | access e2e, probe G, roles audit 581/0 |
| 6.5 | Lighthouse / mobile checks | met | /start LCP 1.06 s, perf 99.5, a11y 100, CLS 0 (`qa2/lighthouse/summary.md`); mobile-village 2592/1 → re-run all pass (INTEGRATE-2) |
| 6.6 | lint / typecheck / build | met | lint 0 errors, tsc 0, build exit 0 (INTEGRATE-2; build again here `qa2/build.log`) |
| 6.7 | A test for N1 | met | unit «N1 apply» + «N1 storage» (`tests/onb-data-unit.test.mjs`), onb-e2e `shared-device-login-google-new-account` ×2 (INTEGRATE-3 + QA-ONB-3) |

## Deploy
| # | Requirement | Status | Evidence |
|---|---|---|---|
| D1 | Merge + production push only after green gates and a clean independent QA | **ready, not done** | gates GREEN (INTEGRATE-3), independent QA **CLEAN** (QA-ONB-3) on `4060d21`; merge/push is the orchestrator's release step |
| D2 | DB additive with backup first, rollback target noted; production smoke with throwaway users | pending | `scripts/onb-smoke-prod.mjs` ready, not run |

## Open points for Panat (not blockers, DECISIONS #7/#8/#14)
Schedule the purge of unconfirmed sign-ups; CAPTCHA; GoTrue timing enumeration; review the Datenschutz paragraph (and whether `/datenschutz-jugend` needs it too).
