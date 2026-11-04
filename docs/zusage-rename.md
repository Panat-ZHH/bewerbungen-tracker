# Umbenennung "Angebot" -> "Zusage"

Der gespeicherte Statuswert ist `offer` (sprachneutral, in `types/index.ts`, `supabase/schema.sql`
und Migrationen). Er bleibt unverändert, daher ist **keine Migration nötig**; nur Labels ändern sich.

Umbenannt:
- `lib/utils.ts` `statusLabels.offer`: Angebot -> Zusage (wirkt in Bewerbungen, Dashboard, Analytics-Balken)
- `app/dashboard/page.tsx`, `app/map/page.tsx`: "Angebot/Angebote" -> "Zusage/Zusagen"
- `components/classes/class-detail.tsx`: StatTile "Angebote" -> "Zusagen"
- `app/analytics/page.tsx`: "Gespräch oder Angebot" -> "Gespräch oder Zusage"

Bewusst behalten:
- `offer` als Code-/DB-Wert, Variablennamen (`offers`), Farben, Map-Stufen.
- `stellenangebote` in jobs.ch-URLs/Tests/Doku (bedeutet "Stellenanzeigen", anderes Wort).
- Englisches "offers" in Kommentaren/Docs (andere Bedeutung).
- `components/friends/shared.ts` sagte bereits "Zusage".
