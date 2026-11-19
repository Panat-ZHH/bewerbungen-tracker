# WendApply release check – 2026-11-18/19

Requirement-by-requirement checklist required by the original release prompt (Panat's condition 2026-11-18 09:06: ship only parts that are really good and really finished). Final version, written by release orchestrator #6 from the 23:15 draft and verified against the reports in `~/Projects/bewerbungen-tracker-wt/_release/`.

| Item | Value |
|---|---|
| Released branch | `rel-1118c` @ **6ac6973** = origin/main cf8b75b (Impressum) + ux-release c2e654e + mobile-shell 92c127d (incl. CFIX 36455a8 + CFIX2) + mobile-roles fb0a2e2 + mobile-public 2ae669c + mobile-village 68de8ba + mobile-test a2cc5d5 + 5 integration cherry-picks + 2 time-of-day test fixes (INTEGRATE-C.md) |
| NOT in the release | `sec-release` (A, 0 of its 52 commits reachable), the 7 security migrations 700000–720000, ai-review redeploy, ux-website (Part 3, preview only), onb-* |
| Migrations | only `20261118800000_teacher_dashboard_placed_contract` (additive, applied live 2026-11-19 01:44, verified) |
| Edge functions | unchanged (supabase/functions = origin/main), no redeploy |

## Shippable decision
| Area | Decision | Reason |
|---|---|---|
| **A – Security** | **NOT SHIPPED** | The one allowed extra round (FIX-A6) was bypassed (REVERIFY-A6 FIX-FIRST, low). Follow-up FIX-A7 6e813e5 → **REVERIFY-A7 GO** → ready for a separate A release on Panat's go (not tonight) |
| **B – UX / calm design / personas** | **SHIPPED** | REVERIFY-B2 GO + FIX-B R3; all requirements met except 3 'partly' items that are a Panat decision (live e-mail template), report-only copy in protected files, and self-scored heuristics (see table) |
| **C – Mobile responsive** | **SHIPPED** | AUDIT-C R3 FIX-FIRST (1 item) → CFIX2 → independent QA-C-PAGES GO + QA-C-VILLAGE on rel-1118c; 'partly' rows are emulation limits (no real device) and polish |
B and C go together (C is built on B).

---

## A – Security / pentest hardening

Original requirements: make all 20 attack classes fail with proof (or mark them n/a with a reason), pass the general OWASP/ASVS L2 list, fix every critical, high and medium finding plus the cheap lows with regression tests, loop fix and fresh re-audit until nothing critical/high/medium is open, write PENTEST-2026-11.md and a German vault note, then run the gates and do the release steps.

**Verdict A: NOT SHIPPED in this release – reason below.** The table shows the state of `sec-release` for a later, separate A release.

- Rule (binding since resume #4): after REVERIFY-A5 exactly ONE more tiny fix round + limited re-check was allowed. Round 6 (FIX-A6 `e6c54ba`) was bypassed: REVERIFY-A6 = FIX-FIRST (B1/B2 non-canonical ObjStm labels → N13b 34 s CPU, N12 +312 MB; severity low). Panat's condition «if something cannot be completed, do NOT ship that part» → A held back (STATE 00:02).
- Follow-up (not part of tonight): FIX-A7 `sec-release` **6e813e5** (code c1ee175) and **REVERIFY-A7 = GO** (B1/B2 + 4 own bypass tries refused ≤ 0.43 s CPU, 277/277 real PDFs identical, 0 crit/high/medium; npm test after 01:00 1235/0). **A is ready for a separate release on Panat's go** (fresh session: merge sec-release onto the then-current main, the 7 security migrations 700000–720000 after a fresh backup, ai-review redeploy, PENTEST §3 live settings, R12 revoke).
- Because A is not shipped: none of the 7 security migrations, no ai-review redeploy, no live auth/Realtime/Netlify setting changed tonight (PENTEST §3 settings are open decisions for Panat).

Since AUDIT-A (09:22), none of the six audit or verify rounds found anything critical, high or medium.

### A.1 The 20 attack classes
| # | Requirement | Status | Evidence |
|---|---|---|---|
| 1 | HTTP/2 Rapid Reset | met (n/a) | No self-hosted endpoint, the edge is Netlify/Cloudflare. AUDIT-A §20 classes #1; PENTEST §1 #1 |
| 2 | Over-long fields / Unicode truncation | met | 6 NOT VALID CHECKs (0 live violators), row caps, `clipText`. AUDIT-A #2; x5 DB attacks 19/19 |
| 3 | SAML/SSO bypass | met (n/a) | Live `saml_enabled: false`, Google OAuth only. AUDIT-A #3 |
| 4 | nOAuth e-mail spoof | met | Manual linking off; admin rule uses identities + email_verified. AUDIT-A #4 |
| 5 | GraphQL alias/batching | met (n/a) | pg_graphql is not installed. AUDIT-A #5 (cosmetic: `graphql_public` is still an exposed schema, see live settings) |
| 6 | TOTP replay / brute force | met | First-factor freshness (A1); deleting an MFA account needs aal2 (R7). delete-mfa e2e ALL PASS (INTEGRATE R3). Same-window replay is a Supabase platform residual |
| 7 | ReDoS | met | x2 all linear (AUDIT-A); I-1…I-8 timing tests are in npm test |
| 8 | JWT alg confusion / none / fixation | met | Every path uses `getUser`, PKCE. AUDIT-A #8 |
| 9 | Request smuggling | met (n/a) | No proxy or raw socket code. AUDIT-A #9 |
| 10 | Cache poisoning | met | `/api/places` private + no-store; guard test http-cache. AUDIT-A #10 |
| 11 | Spoofed IP headers | met | FIX-A round 1 (fe6cdcf): Netlify-only `x-nf-client-connection-ip`. REAUDIT-A x4 B2/B3 50 → 1 bucket; REVERIFY-A5 re-run «N4 7 IP-header tricks ALL PASS» |
| 12 | Views bypassing RLS / definer search_path / grants | met | 0 views, RLS 49/49, 0 definer functions without search_path. AUDIT-A x5; DB-PREP §3 |
| 13 | Weak randomness | met | `Math.random` is used for UI only; feed-token format check. AUDIT-A #13 |
| 14 | Timing / enumeration | met | `timingSafeEqual`, rate-limited lookups (714000). v1 `class_add_coteacher` must be revoked about a day after deploy (release step R12) |
| 15 | Padding oracle / crypto misuse | met (n/a) | No CBC, AES-GCM push. AUDIT-A #15 |
| 16 | Prototype pollution | met | `onlyKeys`, fixed-key rebuilds. AUDIT-A #16 |
| 17 | Template / e-mail / ICS / prompt injection | met | ICS CR fix, tagged prompt blocks. AUDIT-A #17 |
| 18 | XXE / zip bomb / PDF bomb / SSRF | **partly → met on sec-release 6e813e5 (REVERIFY-A7 GO), not shipped** | DOCX x1 and N1 plus every PDF attack from rounds 1–7 are refused (REVERIFY-A5 re-run table; INTEGRATE R3 attacks.log and attacks-variants.log ≤ 61 ms). **Open:** N12/N13/N13b/N14 (low, ObjStm amplifiers, up to 33 s CPU, REVERIFY-A5 «Exact fix list»). open – later A release |
| 19 | Realtime hijack | **partly** | Code: publication empty, private channels deny. **Live `realtime.private_only` = null** (AUDIT-A live settings; PENTEST §3). open – part of the later A release (Panat decision) |
| 20 | Unicode tricks | met | Bidi/ZWSP strip with ZWNJ/ZWJ kept (700000 + TS), Gmail normalisation. AUDIT-A x5 |

### A.2 General items and deliverables
| Requirement | Status | Evidence |
|---|---|---|
| IDOR on every API route / RPC | met | 18 routes checked; test sec-db-idor-db. AUDIT-A «General items» |
| Mass assignment | met | AUDIT-A x5 role escalation fails |
| Open redirects | **partly** | Code: x3 0 of 32 payloads leave the origin. **Live redirect allow-list still has localhost:3000/3204 and `*--bewerbungen-pawat.netlify.app`** (PENTEST §3). Open – later A release (Panat decision) |
| CSRF / CORS | met | Bearer-only, no ACAO on Next API routes |
| Security headers / CSP / clickjacking | met | `frame-ancestors 'none'`, HSTS, static headers test. `'unsafe-inline'` is an accepted low |
| File upload (type, size, sniffing, buckets) | met | Magic bytes, 5 MB limit, storage quota (x5). PDF/DOCX amplification is tracked under #18 |
| SSRF | met | Fixed hosts, push endpoint allow-list |
| Secrets (repo, history, bundle, build logs) | **partly** | Repo, history, bundle: 0 hits (AUDIT-A). **Netlify open:** 2 vars not marked secret, previews carry the prod service-role and Stripe keys, deploy logs are public (PENTEST §3; not verified by AUDIT-A) |
| Dependency audit | met | `npm audit --omit=dev` 0. Dev-only picomatch is accepted |
| Supabase advisors (live) | **partly** | Only WARN left: leaked-password protection (HIBP) off. Open – later A release (Panat decision) |
| OWASP Top 10 / ASVS L2 | **partly** | Code side met. ASVS L2 auth live settings are open: HIBP, security notification e-mails, CAPTCHA (PENTEST §3) |
| Exposed service-role usage | met (code) | Server-only; bundle scan clean. The preview-key issue is listed under Secrets |
| Stripe webhook signature + idempotency | met | Raw body + signature, `stripe_events`. AUDIT-A |
| Price / entitlement tampering | met | Server-side prices; supply-billing-tampering test |
| Race conditions (trial / licence / coins) | met | FOR UPDATE / FOR SHARE (712000); sec-db-race-db |
| Rate limits (auth / AI / DB) | met | Every route limited; #11 fixed. A CAPTCHA is recommended (live, listed under ASVS) |
| Error leakage / PII logging | met | Fixed codes; no e-mails or tokens in logs |
| /admin re-check | met | Guard order: getUser → aal2 or Google-verified → 12 h → limits |
| GDPR / revDSG export and deletion | met | Export fix, waitlist cleanup trigger (713000). `privacy_retention_purge` is not scheduled (owner decision) |
| Regression test per fix | met | Security unit tests 230: 228 pass / 0 fail / 2 skip; npm test 1240/0 (INTEGRATE R3) |
| Nothing critical/high/medium open | met | 0 C/H/M in AUDIT-A, REAUDIT-A and REVERIFY-A2…A5 |
| Cheap lows fixed (loop until clean) | met on sec-release 6e813e5 (not shipped) | All lows incl. N12–N14 (FIX-A6) and B1/B2 (FIX-A7) fixed; REVERIFY-A7 GO, no bypass of the new rules |
| Deliverable `docs/security/PENTEST-2026-11.md` | **partly** | Committed (e138890 …, round 5 d91aee2). REVERIFY-A5 «Acceptance (d)»: the #18 text «blocked / largest cost N5 +147…+225 MB» is an over-claim. Its §4 names rollback target 2112f1b, but origin/main is now cf8b75b. open – later A release |
| Deliverable: German vault note | **partly** | `Projekte/WendApply Pentest 2026-11.md` exists (20:33). It has the same #18 over-claim (REVERIFY-A5 (d), «vault line 36») |
| Migrations additive, replayed on a live backup | met | DB-PREP: backup `wendapply-pre-release-2026-11-18-1428`, 77 PASS ×2, 52 tables identical, rollback script tested |
| Deploy steps | n/a tonight | A not deployed; see the A release plan above |

---

## B – UX, calm design, persona review (Parts 0–2; Part 3 website not in this release)

Original requirements: research-based principles document; calmer but still cool design through shared tokens/components (one primary action, consistent states and colours, AA contrast, 44 px, reduced motion); persona review of every page, button, label, state, e-mail and modal for Schüler (incl. solo), Eltern, Lehrperson and Schule, with every finding fixed; consistent terms; du/Sie decision; logical flows and landing pages; before/after checklist; security, access and billing logic untouched; gates incl. Lighthouse and before/after shots.

**Verdict B: GO – SHIPPED** (in rel-1118c via ux-release c2e654e). REVERIFY-B2 (ce227c6) is GO, FIX-B «Round 3» c2e654e fixed the P3 copy items 1–5, and INTEGRATE R3 has c2e654e merged with /hilfe wording 0 forbidden. Two report-only leftovers remain (see residuals).

| # | Requirement | Status | Evidence |
|---|---|---|---|
| P0.1 | `docs/ux/PRINCIPLES.md` with cited sources | met | 219 lines, 29 URLs (NN/g, Laws of UX, HIG, M3, WCAG 2.2, GOV.UK, Swiss DS, eCH-0059, Leichte Sprache). AUDIT-B §2 P0.1 |
| P0.2 | All listed research topics covered | met | AUDIT-B §2 P0.2 |
| P0.3 | German vault note (principles, findings per role, decisions, live status) | met | `WendApply UX-Prinzipien.md` + main note `Projekte/Bewerbungen Tracker.md` section «2026-11-19 – Release UX + Mobile» (per-role findings summary, decisions, live status, rollback) written by the release orchestrator (R13) |
| P1.1 | Calm design through shared tokens/components | met | 3 elevation levels, Button/Card/Badge/Modal/EmptyState; hard shadows 129 → 24. AUDIT-B P1.1 |
| P1.2 | WendApply identity kept | met | AUDIT-B P1.2 shots |
| P1.3 | Applied to parent / teacher / school (admin where trivial) | met | AUDIT-B P1.3 |
| P1.4 | One primary action per screen | met | Parent paid card fixed (FIX-B P1, plan-card.tsx:71-75), verified live in REAUDIT-B §2 (`eltern/paid-m-102`) |
| P1.5 | Consistent states and status colours | met | `statusFamily`; «Verbunden» always green (CONSENT_TONE + test). REAUDIT-B §2 |
| P1.6 | Contrast AA light + dark | met | 0 findings in 72 views. AUDIT-B P1.6 |
| P1.7 | 44 px touch targets | met | Coarse-pointer `sm` override; all REAUDIT-B 36 px controls measure 44 with hasTouch (AUDIT-C table «REAUDIT-B 36px controls»; CFIX items 2–5, 10). Re-measured by AUDIT-C R3 on 47e6ae4 (same UI code as rel-1118c): REAUDIT-B 36 px list all met, 0 targets < 44 in 1247 records |
| P1.8 | Reduced motion | met | globals.css media blocks, JS guards. AUDIT-B P1.8; AUDIT-C row «prefers-reduced-motion» |
| P1.9 | Dark mode works | met | Pupil + access dark shots (AUDIT-B); all roles at 390 dark (AUDIT-C sweep, CFIX 4 dark variants) |
| P2.1 | Every page/button/label/state/modal reviewed per role | met | Findings: Schüler 42, Eltern 28, Lehrperson 30, Schule 32. Re-tours 218/111/157/124 (AUDIT-B) and 217/113/159/125 (REAUDIT-B §4) |
| P2.2 | E-mails reviewed and fixed | **partly** | All templates use du and are consistent. **`confirmation.html` is not applied live**: that is a live Supabase Auth setting, and the original release prompt allows auth-setting changes only where the security report requires them → open decision for Panat (needs `scripts/apply-*.sh`), the stale `email-templates/recovery.html` is still there, and there are no school e-mails (AUDIT-B P2.2; FIX-B «not done»; BUGS.md) |
| P2.3 | All findings fixed or explicitly justified | met | Open items logged in `_ux/findings/BUGS.md` «release fixer B» (REAUDIT-B §2 P3 row) |
| P2.4 | Consistent terms (GLOSSARY) | **partly** | App sweep clean after FIX-B2/B3 (REVERIFY-B2 §4; FIX-B R3 greps 0). **Report-only leftovers in protected files:** `app/api/account/delete/route.ts:53` «Familien-Abo/Schul-Abo», `lib/b2b/licence.ts:32` «individuelles Angebot». The public marketing pages belong to the website branch |
| P2.5 | Du/Sie decision applied | met | «du» everywhere in the app; `billing/logic.ts:42` and /hilfe fixed (FIX-B P1, F3) |
| P2.6 | Sensible landing page per role | met | AUDIT-B P2.6 tours. The teacher-who-is-also-school-admin case (schule-04) is an open Panat decision |
| P2.7 | Onboarding per role | met | AUDIT-B P2.7 |
| P2.8 | Relations explained at the point of use | met | AUDIT-B P2.8 |
| P2.9 | No dead ends / loops | met | H1 on not-found pages (FIX-B P2; REAUDIT-B §2) |
| P2.10 | Before/after heuristic checklist per page (target ≥ 13, none < 11) | **partly** | Scores exist for 84 pages (`_ux/findings/*-scores-*.json`), but they are self-scored. `/schul-admin` teacher-admin 6, `/profile` (school admin, no licence) 9 and `/hilfe` 9–11 were not re-scored after the fixes (AUDIT-B P2.3/P2.10) |
| P2.11 | Security/access/billing/rate-limit logic untouched | met | Protected diff empty (REVERIFY-B2 §2); migration 800000 reviewed as additive (REAUDIT-B §3) |
| P2.12 | Teacher home count = class page («Zusage oder Lehrvertrag») | met | Migration 20261118800000 applied live 2026-11-19 01:44 and verified (prosrc contains contract_signed, grants ok); Überblick 24/24 (INTEGRATE-C); live check in SMOKE-C |
| G-B | Gates incl. access/paywall/admin/billing e2e | met | See «Release gates» (INTEGRATE R3) |
| G-B2 | Lighthouse before/after | met | BEFORE on production: `_ux/lh/BEFORE.md` (mobile average 98). AFTER exists only for the website branch (`_ux/lh/AFTER.md`). AFTER on the release build (preview rel-1118c-qa, median of 3, QA-C-PAGES): perf 98/95/100/97, a11y/bp 100 – no regression vs BEFORE |
| G-B3 | Screenshots before/after | met | `_ux/baseline`, `_ux/shots`, `_release/audit-b`, `reaudit-b/shots` (614), `fix-b/shots`, `fix-b2/shots` |

---

## C – Mobile responsive (iOS / Android, village placement first)

Original requirements: village placement on touch first (panel above the nav or replacing it, bottom sheet with handle and safe area, dvh, the 5 actions always visible at ≥ 44 px, tap/drag/pinch/pan without browser conflicts, resize on rotation and keyboard). Then every page and modal of every role plus the public site at 320–1024 px, with no h-scroll, clipping or hidden content, keyboard-friendly forms, safe areas/PWA and viewport meta. Real Playwright device emulation (WebKit iPhone SE/13/15/15 Pro Max/iPad; Chromium Pixel 5/7, Galaxy S9/S23/Tab), landscape, throttled network, text at 130–200 %, before/after shots, automated regression checks in e2e. Logic untouched, gates incl. Lighthouse mobile ≥ 90, German vault note, report with before/after village shots and a per-page fix list.

**Verdict C: GO – SHIPPED** (rel-1118c 6ac6973). AUDIT-C Round 3 (independent, 47e6ae4, same UI code) = FIX-FIRST for one item (/search Filter «Fertig» at 150–200 %) → CFIX2 92c127d merged → independent re-check QA-C-PAGES on rel-1118c = GO (24/24). QA-C-VILLAGE on rel-1118c: see G-C3. Remaining 'partly' rows are emulation limits or polish, no known functional bug.

| # | Requirement | Status | Evidence |
|---|---|---|---|
| C1.1 | Item panel above the bottom nav (or nav hidden while placing) – Panat's trigger | met | AUDIT-C (c3c4d7d) on all 7 touch runs; INTEGRATE R3 mobile-village e2e **2594/0** (6 devices × portrait/landscape × light/dark) |
| C1.2 | Bottom sheet with drag handle + `env(safe-area-inset-bottom)` | met (emulated) | AUDIT-C C1 row 2; `village-mobile.css`, `--bottom-clearance` |
| C1.3 | No empty strip below the nav | met | AUDIT-C: map bottom = nav top ±2 px; 84pt bar (REPORT-shell) |
| C1.4 | dvh/svh with vh fallback | met | AUDIT-C: every 100vh paired with dvh plus an `@supports` fallback |
| C1.5 | Platzieren/Abbrechen/Drehen/Verschieben/Entfernen always visible, ≥ 44 px | met | AUDIT-C: 5/5 visible on every device and stage |
| C1.6 | Tap a tile to place (incl. Chromium landscape) | met | AUDIT-C; REPORT-village R5 table (all devices green); INTEGRATE R3 2594/0 |
| C1.7 | Drag to move, pinch zoom, two-finger pan | met | Chromium real CDP touch; WebKit synthetic multi-touch only (AUDIT-C) |
| C1.8 | No scroll/zoom conflicts, no pull-to-refresh, no text selection or long-press menus | met (emulated) | scrollY 0, scale 1, `touch-action:none`, overscroll none (AUDIT-C). The iOS long-press callout cannot be emulated |
| C1.9 | Canvas resizes on rotation | met | AUDIT-C: canvas width = innerWidth after rotation |
| C1.10 | Canvas follows the on-screen keyboard | **partly** | Emulated keyboard viewport only (REPORT-village; AUDIT-C «not re-tested») |
| C1.11 | One panel at a time (V1 «Laden» while an item is selected) | met | def9895 (REPORT-village R5); shop-v2-items 26/26 and village e2e V1 step green (INTEGRATE R3). Independent: AUDIT-C R3 (phones; iPad toggles the side shop by design) + QA-C-VILLAGE trigger run 2 65/0 on rel-1118c |
| C1.12 | Persistence after reload; Entfernen → inventory | met | AUDIT-C all runs |
| C1.13 | Class village + friend island | **partly** | Friend island met on 6 devices. Class village was only code-reviewed at 320 (AUDIT-C) |
| C2.1 | No horizontal scroll, every role + public, 320–1024 | met | AUDIT-C 300 records 0; CFIX 165 records 0; public matrix 20 URLs × 10 viewports (REPORT-public) |
| C2.2 | Nothing clipped/overlapping (incl. 200 % text) | met (polish residuals) | AUDIT-C R3 1247 records 0 clipped except /search Filter «Fertig» → CFIX2 → QA-C-PAGES 24/24 + 832 records 0 clipped. Polish only (still usable): modal body ~64 px at 320×640/200 %, /classes/join narrow at 200 %, /schul-admin Lizenz list narrow (school-admin.tsx:117) |
| C2.3 | Nothing behind the bottom nav; sticky bars clear the content | met | AUDIT-C 0 «under-nav»; shell contract `--bottom-nav-h/--bottom-clearance` |
| C2.4 | Tables → cards / own scroller | met | AUDIT-C row «Tables» |
| C2.5 | Modals/sheets fit the viewport and scroll inside; filter sidebar → sheet | met | AUDIT-C (Mehr sheet, public menu); REPORT-shell (search filter Modal) |
| C2.6 | Forms: inputs ≥ 16 px, type/inputmode/autocomplete/enterkeyhint, not hidden by the keyboard | met | AUDIT-C 0 inputs < 16 px; REPORT-roles enterKeyHint; KeyboardInset mounted (REPORT-shell). Real keyboard untested |
| C2.7 | 44 px tap targets | met | AUDIT-C R3 1247 records + QA-C-PAGES 832 records (pointer coarse): 0 targets < 44 px except one inline blockquote link (WCAG 2.5.8 inline exception) |
| C2.8 | Long German words wrap | met | AUDIT-C (hyphenation visible) |
| C2.9 | Bottom nav safe-area, no double bars | met | REPORT-shell contract; CFIX bar right edge ≤ 320 |
| C2.10 | Viewport meta (viewport-fit=cover, no user-scalable=no), theme-color | met | `app/layout.tsx:41` (AUDIT-C); ThemeColorSync (REPORT-shell) |
| C2.11 | PWA standalone, notch / dynamic island / landscape safe areas | **partly** | Emulation only (simulated 34 px inset). No real device or standalone check (all 4 builder reports; AUDIT-C) |
| C2.12 | Light + dark; prefers-reduced-motion | met | AUDIT-C rows |
| C2.13 | Text scaling 130–200 % | met | Shell, roles and public matrices at 130/200 %; CFIX 200 % variants (clipping is tracked under C2.2) |
| C3.1 | Device matrix WebKit SE/13/15/Pro Max/iPad + Chromium Pixel 5/7, S9/S23, Galaxy Tab | **partly** | Village: SE/15/Pro Max/iPad/Pixel 7/S23 green. `scripts/mobile-lib.mjs` lists 21 devices incl. Galaxy Tab S4, QA-MOBILE 3/4 never produced a full 21-device run (4 died at the cap). Covered instead: AUDIT-C R3 (WebKit 320–1024, iPad, Pixel 7 landscape) + QA-C-PAGES (WebKit + Chromium 320/390 × 100/200 % × light/dark) + village 6 devices. Pixel 5, S9 and Galaxy Tab not run as named devices |
| C3.2 | Landscape | met | Village R5 table; roles/public landscape viewports |
| C3.3 | Throttled network | **partly** | `SLOW_4G` profile in mobile-lib.mjs. Only a public-page LCP trace is reported (REPORT-public: 1.6–1.8 s) |
| C3.4 | Before/after screenshots of every page | **partly** | Public, shell and roles have before/after (`_mobile/shots/{before,after,public,shell}`). Village «before» = ux-qafix baselines only, with no landscape/Chromium before (REPORT-village) |
| C3.5 | Automated responsive regression checks in e2e | met | `scripts/mobile-responsive-e2e.mjs` (overflow, nav overlap, tap targets, input size), `mobile-village-e2e.mjs`, `tests/mobile-lib.test.mjs` |
| C4 | Security/access/billing/paywall logic untouched | met | AUDIT-C: 0 protected files changed by mobile branches; CFIX layout classes only |
| G-C1 | Gates lint/tsc/unit/e2e/build | met | INTEGRATE R3 |
| G-C2 | Lighthouse mobile ≥ 90 on key pages | met | Preview https://rel-1118c-qa--bewerbungen-pawat.netlify.app, median of 3 (QA-C-PAGES): / 98, /schulen 95, /preise 100, /login 97 perf; a11y 100, best practices 100, SEO 100 (/login 63 = intentional noindex, app/layout.tsx:24) |
| G-C3 | Independent QA found nothing broken | met | AUDIT-C R3 (FIX-FIRST 1 item → CFIX2); on rel-1118c 6ac6973: QA-C-PAGES GO (832 records, /search 24/24) and QA-C-VILLAGE GO (mobile-village e2e 2594/0 on 6 devices, 52 min; trigger case 65/0) |
| D-C1 | German vault note (mobile) | met | Section «Mobile (C) – Ergebnis» in `Projekte/Bewerbungen Tracker.md` (2026-11-19) |
| D-C2 | Report: before/after village shots on a phone + per-page fix list | met | Fix lists per page: REPORT-shell/roles/public, CFIX. Shots: `_mobile/shots/village`, `audit-c/shots`, `integ3/shots/village`. Village before/after shots: `_mobile/shots/village`, `_mobile/shots/release-c/village`. The final Panat report = release orchestrator summary + this file |

---

## Release gates (rel-1118c)
| Gate | Result |
|---|---|
| `npm run lint` (6ac6973) | 0 errors (`_release/rel-c-final/lint.log`) |
| `npx tsc --noEmit` (6ac6973) | exit 0 |
| `npm test` (6ac6973, 01:40) | 1088: 1076 pass / **0 fail** / 12 skipped (after the time-of-day test fixes 1fa395c, c1c5f61) |
| `npm run build` (6ac6973) | ok (public mock keys, billing flag unset) |
| Security unit tests (c1c5f61) | 330/0 (INTEGRATE-C) |
| e2e (c1c5f61, INTEGRATE-C; 6ac6973 only adds a 1-line layout class change) | admin 11/0 · billing-ui OFF 49/0, ON 72/0 · access 89/0 · teacher 112/0 · teacher-flow ALL PASS · b2b 108/0 · friends ok · shop-v2-items 26/26 · mobile-village 2594/0 · Überblick 24/24 · /hilfe + /impressum ok · delete-mfa n/a (sec-release script) |
| Migration replay | PGlite replay of live backup + 800000: 18/0 (INTEGRATE-C); live dry-run listed exactly 800000 (BACKUP-C + orchestrator) |
| Responsive sweep (6ac6973) | QA-C-PAGES: 832 records + 25 modals, 0 h-scroll / under-nav / inputs < 16 / targets < 44; /search Filter 150/200 % 24/24 |
| Village (6ac6973) | QA-C-VILLAGE (see G-C3) |
| Lighthouse mobile (preview rel-1118c-qa) | / 98 · /schulen 95 · /preise 100 · /login 97; a11y 100, bp 100, SEO 100 (/login 63 intentional noindex) |

## Release steps (B + C)
| # | Step | Result |
|---|---|---|
| R0 | Shippable decision; final branch/SHA | A not shipped; B+C via `rel-1118c` 6ac6973 (+ this checklist commit) |
| R1 | Rollback target recorded BEFORE push | Netlify deploy **6afddc1c3f9e448415af05cc** (main cf8b75b) – STATE.md 01:43 |
| R2 | Fresh live backup | `~/JARVIS/workspace/backups/wendapply-pre-release-2026-11-19-0140/` (872 KB, SHA256SUMS ok, 86 tables dump = live) – BACKUP-C.md |
| R3 | Hash + dry-run | 800000 sha256 97a21b28… = DB-PREP; `db push --dry-run` listed exactly `20261118800000` (twice) |
| R4 | Apply BEFORE the app deploy | 2026-11-19 01:44, `sb privat db push --linked --yes`, only 800000 |
| R5 | Verify (DB-PREP §4, 800000 part) | 51 migrations, max 20261118800000; RLS-off 0; impl execute for authenticated f, teacher_dashboard t; prosrc contains contract_signed |
| R6 | PENTEST §3 live settings | **not changed** – they belong to A (not shipped); open decisions for Panat |
| R7 | ai-review redeploy | n/a (functions = origin/main) |
| R8 | B e-mail template `confirmation.html` | not applied (auth setting, not required by the security report) – open decision |
| R9 | Merge into main, push, Netlify deploy | see STATE.md (RELEASE lines) |
| R10 | Production smoke test (throwaway users, deleted) | see `_release/SMOKE-C.md` |
| R11 | 0 probe users live | before release: 0 (CLEANUP-QA4: 18 QA-4 leftovers deleted); after smoke: SMOKE-C.md |
| R12 | Revoke v1 `class_add_coteacher` | n/a (belongs to A) |
| R13 | Vault notes | `Projekte/Bewerbungen Tracker.md` section 2026-11-19 incl. «Mobile (C) – Ergebnis» |
| R14 | Real-device check (Panat's iPhone, dark, Laden → Sport-Roller → Platzieren → Laden) | open – Panat |

## Known residuals (documented, none critical/high/medium)
**A** – not shipped; residual list for the later A release: see `docs/security/PENTEST-2026-11.md` on sec-release and REVERIFY-A7.md.

**Pre-existing, not changed by this release**
- BUG-C1 (billing, low): `_licence_state` / days-left use the DB `current_date` (UTC) against Europe/Zurich licence dates → between 00:00 and 01:00 CET (02:00 CEST) a just-paid school/family can show pilot/not_started and an immediate cancel stays active up to 1 h longer. Live since 20261116100000; billing IS live (Stripe since 2026-11-17). Exact fix in `_release/integ-c/BUGS.md` → separate small billing fix with Panat's go.

**B (copy, report-only)**
- `app/api/account/delete/route.ts:53` «das Familien-Abo / das Schul-Abo» (glossary: Familienpaket / Schullizenz). Protected file, needs a security-reviewed round.
- `lib/b2b/licence.ts:32` «individuelles Angebot» (glossary: individuelle Offerte). Protected file.
- Public marketing pages (/familien «Ihr Kind», Sie; /preise «Schüleraccount/Elternaccount»; /datenschutz-uebersicht «Schüler/in») belong to the website branch.
- Flag-off only: the parent trial banner and plan card disagree (REAUDIT-B).
- Stale `email-templates/recovery.html`; no school e-mails (pilot or licence end).
- Self-scored checklist pages below the floor were not re-scored (/schul-admin teacher-admin, /profile school admin without a licence, /hilfe).
- Open Panat decisions (BUGS.md): teacher who is also school admin is locked out of /schul-admin (schule-04); `classes.school_id` NULL / licence coverage not visible to teachers (lehrperson-01); eltern-21; eltern-26 (/settings vs /profile paywall); expired pupils cannot read their own data; friends sharing default ON under 16; support address; AI provider not named in the privacy texts.

**C (mobile)**
- No real iOS/Android device test: safe areas, real keyboard, standalone PWA, long-press callout, real WebKit multi-touch.
- WebKit: tapping the scooter after synthetic two-finger gestures didn't select it (AUDIT-C; likely a harness artefact, not disproven).
- Galaxy S23 portrait light close + one-finger pan failed once in r4 and r5 and passed on re-run; root cause not proven (REPORT-village R5).
- Class village only code-reviewed at 320 px.
- /datenschutz-jugend blockquote inline link < 44 px (WCAG 2.5.8 inline exception).
- Lighthouse levers outside the mobile owners: 4 preloaded font files (104 KB), 172 KB shared root-layout JS (`_mobile/findings/NEEDS-SHELL.md`).
- History keeps 5 orphaned «WIP mobile-*» commits; their content was superseded (INTEGRATE R3 static checks).

- /classes/join and /schul-admin Lizenz list narrow at 200 % text, modal body ~64 px at 320×640/200 % (polish, QA-C-PAGES).
- Accidental empty Netlify site `sage-pika-36c996` created by a QA helper (nothing deployed) – delete on Panat's OK.
