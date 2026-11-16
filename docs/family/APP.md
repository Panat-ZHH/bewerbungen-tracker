# Familien / Privatkunden: app part (fam-app)

UI only. No migrations, no payment code. Calls only the RPCs from the shared contract (never the family tables).

## Screens
- **Signup** (`app/login/page.tsx`): "Ich bin" now offers *Schule*, *Schüler:in privat*, *Elternteil*, *Lehrperson*.
  *Schule* writes the same metadata as before (`{ role: "student" }`), so school students are unchanged.
  *Schüler:in privat* asks for the **Jahrgang** only (data minimisation) and shows a plain-language under-16 hint.
  The choice is kept in `user_metadata` (`account_type`, `birth_year`) and stored with `account_set_type` on the first
  sign-in (`syncPendingAccountType`, retried until it succeeds; then `account_type_synced: true`).
- **Role picker** (`/auth/role`, first Google login): same four choices.
- **/familie**: parent dashboard (create family, invite child with code + link + copy/share, children with consent status,
  consent grant/withdraw with confirmation, remove, child overview from `family_child_overview`, plan card) or child side
  (join with code, invite a parent, under-16 consent notice, share switches via `family_set_share`, leave).
- **/familie/einladung/[code]**: invite link, code pre-filled (logged-out users return here after login).
- **Plan card**: status from `family_get_my().plan` (Testphase/Pilot/Aktiv/Pausiert/Beendet, seats, trial days),
  "Bezahlung bald verfügbar" + **Zugang anfragen** (`waitlist_join`; falls back to /kontakt if not deployed).
- **Einstellungen › Meine Daten**: export now includes `family` (`family_export_my_data`), secrets stripped.
- **Navigation**: parents (`account_type = parent`) get a compact menu (Familie, Profil, Einstellungen) and are sent from
  the job-search pages to /familie. Private students see "Familie" under "Mehr". Students in a class see no change.

## Not deployed yet
Every family RPC is optional: a missing function (PGRST202 / 404) shows "Familien-Funktion bald verfügbar" with
"Zugang anfragen", never an error. `account_set_type` failures are silent and retried.

## Files
`lib/family-core.ts` (pure, unit-tested), `lib/family.ts` (RPC wrappers), `components/family/*`, `app/familie/**`,
`components/onboarding/role-cards.tsx`, small edits in `workspace-shell.tsx`, `lib/role.ts`, `app/settings/page.tsx`.

## Tests
- `tests/family-app.test.mjs` (14 tests): helpers, role landing, source contract (RPC-only, no payment code, Swiss spelling).
- `scripts/family-app-e2e.mjs` (116 checks, mobile light + desktop dark): parent, child, not deployed, school student,
  signup, role picker. Run against a dev server with the dummy Supabase env:
  `PLAYWRIGHT=<playwright-core/index.mjs> CHROME=<chrome> BASE=http://localhost:3292 node scripts/family-app-e2e.mjs`

## Assumptions for the DB part (please check)
- RPC errors are raised with short codes in the message: `SEATS_FULL`, `INVITE_EXPIRED`, `INVITE_ALREADY_USED`,
  `INVALID_CODE`, `ALREADY_MEMBER`, `FORBIDDEN` (see `familyError`). Unknown messages get a generic text.
- `family_get_my().members[]` may include `share_settings` for the caller's own row (otherwise defaults are shown).
- `family_child_overview` returns `{ child:{display_name}, consent_status, progress:{total,status_counts,last_activity}|null,
  village:{level,items,points}|null, applications:[{company,position,status,updated_at}]|null }`; null blocks = not shared.
- `family_create_invite` for a child without a family creates the family (the UI offers "Elternteil einladen" right away).
- Parents keep `profiles.role = 'student'` (set_my_role) plus `account_type = 'parent'`.
