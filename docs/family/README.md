# Familien und Privatkunden – Datenmodell

Migration: `supabase/migrations/20261116140000_family_accounts.sql` (nach den B2B-Migrationen ausführen, idempotent).
Tests: `tests/family-db.test.mjs` (PGlite, alle Migrationen, zwei Familien). Technische Übersicht auf Englisch:
`docs/b2b/DATA-MODEL.md`, Abschnitt «Familien».

**Noch nichts davon ist auf der Live-Datenbank.** Es gibt keinen Zahlungscode: Pläne werden von Hand zugewiesen.

## Kontotypen

| `profiles.account_type` | Wer | Wie |
|---|---|---|
| `school_student` | Schüler:in in einer Klasse (Schule oder Lehrperson) | automatisch beim Klassenbeitritt; bestehende Klassenmitglieder wurden migriert |
| `independent_student` | eigenständige Schüler:innen (Standard) | Selbstregistrierung |
| `parent` | Eltern | `account_set_type('parent')` |

Lehrpersonen und Schuladmins behalten ihre Rolle in `user_roles`. Schulkonten ändern sich nicht: alle Schul- und
Lehrer-Funktionen, Freigaben und Lizenzen funktionieren wie bisher. Ein Schulkonto kann zusätzlich als Kind einer Familie
beitreten; die Eltern sehen dann nie Klasse, Lehrperson oder Mitschüler:innen.

`profiles.birth_year`: nur das Geburtsjahr (Datenminimierung). Kontotyp und Geburtsjahr lassen sich nur über
`account_set_type()` ändern, nicht direkt in der Tabelle.

## Familie

* Eine Familie hat Eltern (`parent`) und Kinder (`child`). Jede Person ist in höchstens einer Familie.
* Familienpaket: **1 Elternteil + 1 Kind**. Mehr Plätze über `seats_parents` / `seats_children` im Familienplan.
* Ohne Plan gilt ebenfalls 1 + 1. Ist die Familie voll, kommt der Fehler `WA010 FAMILY_SEAT_LIMIT` mit deutschem Text.
* Wer zuletzt geht oder sein Konto löscht, nimmt die Familie mit (Name, Einladungen und Plan werden gelöscht).

### Beitreten

1. **Eltern laden ein:** Elternteil erstellt die Familie (`family_create`) und einen Code
   (`family_create_invite('parent_invites_child')`). Das Kind gibt den Code ein (`family_join`).
2. **Kind lädt ein:** Das Kind erstellt einen Code (`family_create_invite('child_invites_parent')`); hat es noch keine
   Familie, entsteht «Meine Familie» automatisch. Ein Elternkonto gibt den Code ein.

Codes: 8 Zeichen, 7 Tage gültig, einmal verwendbar, höchstens 10 offene pro Familie. Kinder müssen vorher ihr Geburtsjahr angeben.

## Einwilligung (unter 16, DSG / DSGVO Art. 8)

* Kinder **unter 16** dürfen die App ganz normal nutzen. Das Teilen mit der Familie bleibt aber **aus**, bis ein Elternteil
  der Familie zustimmt (`family_set_consent(kind, true)`). Status: `pending` → `granted` (oder `withdrawn`).
* Weil nur das Jahr gespeichert ist, rechnen wir vorsichtig: wer dieses Jahr 16 wird, gilt noch als unter 16.
* Ab 16 entscheidet das Kind allein (`not_required`); Eltern können dann nichts erzwingen oder widerrufen.
* Ein Kind in einer Familie kann sich nicht älter machen (sonst liesse sich die Einwilligung umgehen); jünger geht.
* Das Kind bestimmt jederzeit selbst, was geteilt wird (`family_set_share`):

| Schalter | Standard | Eltern sehen |
|---|---|---|
| `progress` | an | Anzahl Bewerbungen, Anzahl je Status, Lehrstelle gefunden ja/nein, letzte Aktivität |
| `village` | an | Anzahl Inseln, Gegenstände, verdiente Punkte |
| `applications` | aus | Liste: Firma, Stelle, Status, Frist, Datum (nie Notizen, Lohn, Links, Ort, Kontakte) |
| `documents` | aus | Name, Typ, Status der Dokumente (keine Dateien) |

Eltern sehen das Kind nur über `family_child_overview(kind)`. Direkter Tabellenzugriff ist durch RLS gesperrt: jede Person
sieht nur ihre eigene Mitgliedschaft, ihre eigenen Einladungen und den Namen ihrer Familie.

## Plan von Hand zuweisen (Service Role / Supabase SQL-Editor)

```sql
-- Familie finden (z. B. über die E-Mail eines Elternteils)
select f.id, f.name from public.families f
  join public.family_members m on m.family_id = f.id
  join auth.users u on u.id = m.user_id
 where lower(u.email) = 'eltern@example.ch' and m.status <> 'removed';

-- 30 Tage Testphase, 1 Elternteil + 1 Kind
select public.admin_assign_family_plan('<family id>', 'trial');
-- Testphase bis zu einem bestimmten Datum, 2 Kinder
select public.admin_assign_family_plan('<family id>', 'trial', '2027-03-31', 2);
-- aktiv, 2 Elternteile + 3 Kinder, mit interner Notiz
select public.admin_assign_family_plan('<family id>', 'active', null, 3, 2, 'Rechnung per E-Mail', 'panat');
-- pausieren / beenden: neue Zeile mit dem neuen Status (Verlauf bleibt erhalten)
select public.admin_assign_family_plan('<family id>', 'paused');
select public.admin_assign_family_plan('<family id>', 'cancelled');

-- Übersicht aller Familienpläne
select l.family_id, f.name, l.status, l.seats_parents, l.seats_children, l.trial_ends_at, l.created_at, l.notes
  from public.school_licences l join public.families f on f.id = l.family_id
 where l.plan_type = 'family' order by l.created_at desc;
```

Massgebend ist der neueste nutzbare Plan (`trial`, `pilot`, `active`), sonst der neueste. Der Familienplan steht in der
gleichen Tabelle wie die Schullizenzen (`school_licences`, `plan_type = 'family'`, `package = 'family'`). Ein abgelaufener
oder pausierter Plan sperrt im Moment nichts (es gibt noch keine Zahlung); die App zeigt `plan.state` an.
`external_ref` ist ein leerer Platzhalter für einen späteren Zahlungsanbieter.

## Warteliste «Zugang anfragen»

`waitlist_join(email, art, nachricht)` darf auch ohne Login aufgerufen werden (Arten: `family`, `parent`, `student`,
`school`, `other`). Gleiche E-Mail + Art wird nur einmal gespeichert; die Antwort ist immer `{ok: true}`, damit niemand
herausfinden kann, ob eine Adresse schon eingetragen ist. Lesen nur mit Service Role:

```sql
select email, kind, message, created_at from public.waitlist_requests order by created_at desc;
-- Löschen auf Anfrage
delete from public.waitlist_requests where lower(email) = 'person@example.ch';
```

Vorschlag Aufbewahrung: Einträge nach 12 Monaten löschen (noch nicht automatisiert).

## Daten exportieren und löschen

* `export_my_data()` enthält neu den Abschnitt `family` (Kontotyp, Geburtsjahr, Mitgliedschaften, erteilte Einwilligungen,
  erstellte Einladungen ohne Code, Wartelisten-Einträge). Einladungscodes werden überall geschwärzt.
* Kontolöschung: Mitgliedschaften und Einladungen werden mitgelöscht; leere Familien samt Plan ebenfalls.
  `account_delete_summary()` meldet zusätzlich `family_member` und `family_others`.

## Fehlercodes (für die App)

`NOT_A_PARENT`, `ALREADY_IN_FAMILY`, `NOT_IN_FAMILY`, `IN_FAMILY`, `INVITE_INVALID`, `INVITE_USED`, `INVITE_EXPIRED`,
`INVITE_WRONG_ACCOUNT_TYPE`, `BIRTH_YEAR_REQUIRED`, `BIRTH_YEAR_LOCKED`, `INVALID_BIRTH_YEAR`, `INVALID_ACCOUNT_TYPE`,
`CONSENT_NOT_REQUIRED`, `INVALID_SETTINGS`, `TOO_MANY_INVITES`, `INVALID_EMAIL`, `RATE_LIMITED`, `FORBIDDEN`, `NOT_FOUND`,
`FAMILY_SEAT_LIMIT` (SQLSTATE `WA010`). Die meisten haben einen deutschen Text in `error.details`.

## Offene Fragen

1. Preis des Familienpakets (bewusst nicht in der Datenbank).
2. Altersgrenze 16 bestätigen (Schweiz: DSG kennt keine feste Grenze, DSGVO Art. 8 erlaubt 13–16 je nach Land).
3. Soll ein abgelaufener Plan später etwas sperren (z. B. die Elternansicht)?
4. Bekommt jede neue Familie automatisch eine Testphase, oder nur auf Anfrage?

## Student flow (2026-11-16, BILLING-FLOW-SPEC §3.2/§3.3)

- `/familie` without a parent: one card "Deine Eltern verbinden" (`components/family/student-start.tsx`). Step 1 creates the
  link (`?fuer=eltern`), step 2 waits; the page refreshes every 15 s and on focus until a parent is in the family.
  "Du hast schon einen Code von deinen Eltern?" is collapsed. With an invite link the join form comes first.
- No birth year (school students): an inline "Jahrgang" question (`setBirthYear` → `account_set_type`), then the original
  action runs again by itself.
- Own empty family + a parent's code → "Der Familie deiner Eltern beitreten?" → `switchToFamily` (leave, then join).
- The child sees only "Familienpaket aktiv" or "Für dich bleibt WendApply kostenlos", never payment problems, and never calls `/api/billing`.
- "Familie" is in the menu for every student. Logged-out invite links keep `?next=` with query and hash, remember the code
  (pending invite kind `family`), preselect the signup role (Elternteil, or Schüler:in privat with `?fuer=kind`) and send
  the confirmation e-mail back to `/auth/callback?next=…` on the same origin (the preview URLs must be on the Supabase redirect allow-list).
- Copy for the whole family/billing flow: `lib/family-copy.ts` (`FAMILY_COPY`, `fill`).
