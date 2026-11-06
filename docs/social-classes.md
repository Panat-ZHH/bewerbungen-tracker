# Freunde, Einladungen und Klassen

## Einrichtung

Nach `supabase/schema.sql` einmal `supabase/social.sql` im SQL Editor ausführen (erneut ausführbar). Bestehende Nutzer erhalten automatisch eine Rolle (`student`) und einen Einladungscode. Neue Nutzer bekommen die Rolle aus den Auth-Metadaten `role` (`student` oder `teacher`, Standard `student`), z. B. `supabase.auth.signUp({ email, password, options: { data: { role: "teacher", full_name: "..." } } })`.

Hinweis: Die Rolle ist beim Signup frei wählbar. Ein "Lehrer" sieht trotzdem nur Schüler, die seiner Klasse per Code beigetreten sind und `share_applications` aktiviert haben. Wer Lehrerkonten einschränken will, muss die Rolle serverseitig setzen (Admin-API).

## Sicherheitsmodell

Alle neuen Tabellen (`user_roles`, `friendships`, `classes`, `class_members`) haben RLS, nur Lesezugriff auf eigene Zeilen und keine Schreibrechte. Zugriff auf fremde Daten gibt es nur über `security definer`-RPCs (`search_path = ''`, prüfen `auth.uid()`, nur für `authenticated`). Nie freigegeben: Notizen, Gehalt, Stellenbeschreibung, Lebensläufe. Nutzer sind nur per exaktem Einladungscode (8 Zeichen) oder exakter E-Mail auffindbar, es gibt keine Suche oder Liste.

Fehler werden als Text in `Error.message` geliefert: `AUTH_REQUIRED`, `FORBIDDEN`, `NOT_FOUND`, `USER_NOT_FOUND`, `CANNOT_ADD_SELF`, `ALREADY_FRIENDS`, `REQUEST_PENDING`, `CLASS_NOT_FOUND`, `INVALID_NAME`, `INVALID_REQUEST`. Helfer: `socialErrorCode`, `classErrorCode`.

## RPCs (Freunde)

| RPC | Parameter | Rückgabe |
| --- | --- | --- |
| `social_my_profile()` | - | user_id, role, display_name, avatar_seed, invite_code, share_with_friends, email |
| `social_update_profile(p_display_name, p_avatar_seed, p_share_with_friends)` | alle optional (null = unverändert) | wie oben |
| `social_find_by_code(p_code)` | exakter Code (Groß/Klein egal) | 0 oder 1 Zeile: display_name, avatar_seed, role, invite_code, relation (`none/self/friend/pending_out/pending_in`) |
| `social_send_request(p_code_or_email)` | Code oder exakte E-Mail | id, status (`pending`, oder `accepted` falls Gegenseite schon angefragt hatte) |
| `social_respond_request(p_request_id, p_accept)` | nur Empfänger | `accepted` / `declined` (Ablehnen löscht) |
| `social_list()` | - | id, other_user_id, display_name, avatar_seed, role, state (`friend/incoming/outgoing`), created_at |
| `social_remove_friend(p_friendship_id)` | id aus `social_list` | void (Freund entfernen, Anfrage zurückziehen/ablehnen) |
| `social_friends_overview()` | - | je Freund: user_id, display_name, avatar_seed, shared, total, status_counts, map_points_earned, map_items (bei `shared = false` null) |

Einladungslink: `/invite/<code>` (`inviteLink(code)` in `lib/social.ts`).

## RPCs (Klassen)

Lehrer: `class_create(p_name, p_school_year)`, `class_list_mine()`, `class_members(p_class_id)`, `class_overview(p_class_id)`, `class_student_applications(p_class_id, p_student_id)`. Nicht-Lehrer oder fremde Klassen: `FORBIDDEN`. Schüler, die `share_applications = false` gesetzt haben, erscheinen mit `hidden = true` und ohne Daten (bei `class_student_applications` eine einzelne Zeile mit `hidden = true`).

Schüler: `class_join(p_code)` (Einwilligung `share_applications` standardmäßig true), `class_my_classes()`, `class_set_sharing(p_class_id, p_share)`, `class_leave(p_class_id)`.

`class_overview` liefert je Schüler: Zähler je Status, Bewerbungen der letzten 7/30 Tage (nach `applied_at`, sonst `created_at`), letzte Bewerbung (Firma, Position, Status, Datum) und bis zu 5 anstehende Fristen offener Bewerbungen (`saved`/`preparing`).

## TypeScript

`lib/social.ts` und `lib/classes.ts` kapseln die RPCs; Typen stehen in `types/index.ts`.

## Runde 2: Migrationen, Klassenverwaltung, Einladungsflow

### Migrationen
`supabase/migrations/` enthält `20260101000000_schema.sql` und `20260101000001_social.sql` (identische Kopien von `schema.sql` / `social.sql`, ein Test prüft die Gleichheit) sowie `20261104000000_class_management.sql` (neu, idempotent). `schema.sql` und `social.sql` bleiben lauffähig; für neue Datenbanken gilt: Migrationen in Dateinamen-Reihenfolge ausführen.

### Neue RPCs
| RPC | Wer | Zweck |
| --- | --- | --- |
| `class_preview(p_code)` | angemeldet | Name, Schuljahr, Lehrkraft, Schülerzahl, `already_member` vor dem Beitritt (sonst `CLASS_NOT_FOUND`) |
| `class_rename(p_class_id, p_name, p_school_year)` | Lehrkraft der Klasse | umbenennen (`INVALID_NAME`); Schuljahr `null` = unverändert |
| `class_delete(p_class_id)` | Lehrkraft der Klasse | Klasse löschen, Mitglieder werden entfernt, Bewerbungen der Schüler bleiben |
| `class_remove_student(p_class_id, p_student_id)` | Lehrkraft der Klasse | Schüler entfernen (`NOT_FOUND` wenn kein Mitglied); Zugriff endet sofort |
| `class_regenerate_code(p_class_id)` | Lehrkraft der Klasse | neuer Beitrittscode, alter Code ungültig, Mitglieder bleiben |

Fremde Klassen oder Nicht-Lehrer: immer `FORBIDDEN`. Tests: `tests/classes.test.mjs`.

### Einladungsflow
- Freundeslink `/invite/<code>`, Klassenlink `/classes/join/<CODE>`. Wer nicht angemeldet ist, wird zu `/login` geschickt; der Code wird in `localStorage` gemerkt (7 Tage, übersteht E-Mail-Bestätigung in neuem Tab).
- Nach dem Login landet der Nutzer (Login leitet derzeit immer auf `/dashboard`) auf `/friends` bzw. `/classes`, wo ein Hinweis die offene Einladung anbietet. `pendingInvitePath()` in `components/friends/shared.ts` liefert den Zielpfad, falls Login/Dashboard direkt dorthin weiterleiten wollen.
- Einladung teilen: Code kopieren, Link kopieren, Web Share, E-Mail (`mailto:`).

### Datenschutz sichtbar
`PrivacyPanel` listet in Klartext, was Lehrkraft bzw. Freunde sehen (✓) und nie sehen (✗). Es steht beim Klassenbeitritt (mit Bestätigungsschritt nach `class_preview`), auf der Klassenseite der Schüler und bei den Freunden. Freigabe pro Klasse lässt sich jederzeit pausieren; eine Freigabe pro einzelner Bewerbung gibt es noch nicht (würde eine Spalte in `applications` brauchen).

### Lehrkraft-Übersicht
Suche (Name oder letzte Firma), Filter (Alle, Inaktiv 30 T, Aktiv 7 T, Mit Zusage, Teilt nicht, jeweils mit Anzahl), Sortierung, Schülerdetail mit „Aus Klasse entfernen“, Dialog „Verwalten“ (Link, Umbenennen, neuer Code, Löschen). Mobil Karten, ab `md` Tabelle.

## Lehrerrolle: Datenschutzmodell (Migration `20261107000000_teacher_role.sql`)

**Grundsatz:** Lehrpersonen lesen keine fremden Tabellen. Jeder Zugriff läuft über `security definer`-Funktionen (`search_path = ''`), die Rolle und Klassenzugehörigkeit prüfen. Die Tabellen `class_teachers`, `class_invitations`, `class_announcements` und `class_notifications` haben RLS ohne Policies und ohne Grants (direkter Zugriff = `permission denied`). Zugriff haben nur Besitzer:in und Co-Lehrpersonen der jeweiligen Klasse; andere Lehrpersonen, Schüler:innen, Fremde und `anon` bekommen `FORBIDDEN` bzw. `permission denied`.

**Was Lehrpersonen sehen (nur wenn die Schüler:in es erlaubt):**

| Schalter (pro Klasse, durch die Schüler:in) | Wirkung |
| --- | --- |
| `share_applications` (Hauptschalter) | Aus: nur der Name. Keine Anzahl, keine Aktivität, nichts weiter. Die Person zählt im Dashboard nur als „versteckt“. |
| `share_status` | Aus: keine Phasen (Bewerbungsstand, Gespräche, Lehrstelle gefunden). Anzahl und letzte Aktivität bleiben sichtbar. |
| `share_companies` | Aus: keine Firmennamen, Stellen, Orte und keine Fristen-Liste. |

Standard für alle Schalter ist „an“ (entspricht dem bisherigen Verhalten). Änderungen wirken sofort (`class_set_sharing_v2`). Die Transparenz-Box der Schüler:in kommt aus `class_visibility_info()`.

**Was Lehrpersonen nie sehen:** Notizen, Stellenbeschreibung, Gehaltsangaben, Kontakte, Dokumente/Lebenslauf, Links zu Stellenanzeigen. Diese Spalten werden von keiner Funktion ausgegeben (Test `teacher-sql.test.mjs` prüft das mit Marker-Texten).

**Weitere Regeln:**
- Co-Lehrpersonen haben dieselben Leserechte und können umbenennen, archivieren, einladen, erinnern und ankündigen. Löschen der Klasse und Verwaltung der Co-Lehrpersonen ist nur Besitzer:in vorbehalten (eine Co-Lehrperson darf sich selbst entfernen).
- Einladungen (`class_invitations`): 64 Zeichen langer Token, Ablauf (1–90 Tage), optionale Maximalzahl, widerrufbar, optional an eine E-Mail-Adresse gebunden (Abgleich mit der Login-E-Mail, sonst `FORBIDDEN`). Unbrauchbare Token verraten keine Klassendetails. Bereits eingetragene Schüler:innen verbrauchen keinen weiteren Platz. Der Beitritt per Kurzcode funktioniert weiter. Archivierte Klassen nehmen niemanden mehr auf.
- Erinnerungen (`class_nudge`): höchstens eine pro Schüler:in und Klasse in 3 Tagen (`RATE_LIMITED`), gilt gemeinsam für alle Lehrpersonen der Klasse. Die Schüler:in sieht sie unter `my_notifications()`. Ankündigungen landen ebenfalls dort.
- Rollenwechsel (`set_my_role`) nur, solange die Person weder Klassen besitzt noch Mitglied ist.
- Zeitverlauf (`class_student_timeline`): es gibt keine gespeicherte Statushistorie, die Ereignisse werden aus den Daten (erstellt, beworben, zuletzt geändert, Frist) abgeleitet.
- Zahlen im Dashboard: `interviews`/`offers` zählen Bewerbungen, `placed` zählt Schüler:innen mit Status „Lehrstelle gefunden“ (`offer`). Archivierte Klassen zählen nicht in die Summen; Schüler:innen in mehreren Klassen werden einmal gezählt.
