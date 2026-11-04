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
