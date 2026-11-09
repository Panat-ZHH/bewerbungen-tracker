# WendApply release-p0

Preview (not production): https://release-p0--bewerbungen-pawat.netlify.app
Branch: `release-p0` (13 part branches merged; nothing merged to `main`, nothing deployed to production).
Status 2026-11-06. Reports of the parts: `~/Projects/bewerbungen-tracker-wt/_brief/report-*.md`.

## Items (UX review section 5)
| # | Item | Part | State |
|---|------|------|-------|
| 1 | Registration mails / concrete auth errors | a | App side done. **Blocked**: custom SMTP (Brevo/Resend ask for CAPTCHA). Supabase default mail (2/h) still live. |
| 2 | Account deletion go-live | b | Done, e2e on live DB passed. Service role key set in Netlify. |
| 3 | Onboarding in 3 screens | c | Done |
| 4 | Public landing page | d | Done |
| 5 | Lehrstellen status pipeline | e | Done |
| 6 | Names / initials | f | Done |
| 7 | Consent text = real switches | f | Done (3 switches, sharing off by default unless "16 oder älter") |
| 8 | Notices visible | f | Done |
| 9 | Bulk invite + CSV | g | Done |
| 10 | Datenschutz package for schools | j | Drafts. **Lawyer review required** before use with schools. |
| 11 | Invitation context on login | c | Done |
| 12 | Teacher KPI | g | Done |
| 13 | Friends privacy defaults | h | Done (company sharing off for everybody once) |
| 14 | Public pages (Schulen, Impressum, Kontakt, Hilfe) | d | Done; Impressum has `[TODO]` markers (street/PLZ, UID, phone) |
| 15 | Reminders (push, mail, ics) | i1 | Done; mail is a no-op until SMTP exists; push untested with real devices |
| 16-19 | Search: auto re-run, place parsing, caching, card info | i2 | Done |
| 20 | Meine Dokumente | i3 | Done (upload/attach not clicked end to end) |
| 21 | Mobile tab bar | i4 | Done |
| 22 | Rewards + weekly goal | i4 | Done; "nachfassen" reward has no feature to hook into (open) |
| 23 | Application detail | i3 | Done |
| 24 | Schnupperlehre in search/class view | e | Done |
| 25 | Teacher "braucht Aufmerksamkeit" | g | Done |
| 26 | Teacher timeline | g | Done |
| 27 | Teacher/student navigation split | g | Done |
| 28 | Class calendar | g | Done |
| 29 | Contrast, friends page order | i4/h | Done |
| 32 | Page titles, Swiss spelling | i4 | Done |
| 33 | Student fields (Berufsfeld, school) | i3 | Done |
| 34, 36 | Search UX polish | i2 | Done |
| 35 | Sharing (share, WhatsApp, QR) | h | Done |
| 37 | Settings: notifications, password | b/i1 | Done |
| 39 | CSV export + audit log | g | Done |
| 41 | Accessibility sweep | i4 | Done (axe: no serious/critical) |
| 30, 31, 38, 40 | not assigned to any part in this release | – | Not done |

## Database (PRIVAT, bhwreehwirrloxagyypi)
Backup before applying: `~/Projects/bewerbungen-tracker-wt/_brief/backup-2026-11-06.sql` (chmod 600, not in git; logical dump of DDL info, policies, functions and all data as JSON — no `pg_dump` on the server).

Applied in order (all additive, idempotent): `20261109010000_student_onboarding`, `…020000_lehrstellen_status`, `…030000_names_consent_notices`, `…040000_teacher_attention_deadlines_audit`, `…050000_friends_privacy_defaults`, `…060000_reminders`, `…070000_documents_student_fields`.
`20261106`–`20261108` were already live. All ten (06 through 09-07) are now also recorded in `supabase_migrations.schema_migrations`.

**Deliberately NOT applied:** the one data delete in `20261109070000_documents_student_fields.sql` (`delete from public.cvs where storage_path is null and id like 'cv-%' and type in ('developer','sales','finance')`). It matches 18 rows, all empty auto-generated placeholders (0 uploaded files). The UI already hides rows without a file, so nothing breaks. Run it after approval.
Side effects of 050000: every user's "share company names with friends" is switched to off once. 070000 maps old application categories (software→informatik, sales→detailhandel, finance→finanz-recht).

RLS check against the live project with throwaway accounts (all removed): anon reads nothing from 24 private tables and cannot call teacher/account RPCs; a student cannot read or write another student's applications, reminders, feeds, push subscriptions, documents; attaching a document to someone else's application fails; a teacher cannot read the applications table directly, sees a student only after the class switch is on, sees no company name when the companies switch is off, and sees nothing of non-members. 51 checks, all pass. Only anon-executable security-definer functions: `invite_context` (intended), `rls_auto_enable` and `create_default_cvs_for_user` (pre-existing).

## Environment variables
Netlify site `bewerbungen-pawat`:
- Present in production, deploy-preview and branch-deploy: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
- Present in **production only**: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `REMINDERS_CRON_SECRET`. Push and the reminder digest do not work on the preview until these are also set for deploy-preview/branch-deploy.
- Missing (optional): `APP_URL`, `VAPID_SUBJECT` (default mailto:support@wendapply.ch, set a real address), `SMTP_*` + `MAIL_FROM` (mail digest stays a no-op).

## Pending for humans
- Custom SMTP: create a Brevo account, verify a sender, SMTP key into `~/.config/alfred/smtp.env`, run `scripts/apply-auth-smtp.sh` (see `docs/email-setup.md`). DNS records for SPF/DKIM/DMARC (values come from the provider; nothing was changed).
- Lawyer review of `docs/legal/*`, fill `[ ]` and `[TODO]` placeholders (Impressum, AVV).
- Known leftover: SQL `_teacher_stats` counts only `offer` as placed (TS list also counts `contract_signed`).
- Production deploy and merge to `main` need an explicit go.
