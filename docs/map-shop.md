# Map-Shop

## Einrichtung

Das aktualisierte [Supabase-Schema](../supabase/schema.sql) einmal im SQL Editor des bestehenden Supabase-Projekts ausführen. Die Datei ist erneut ausführbar und übernimmt vorhandene abgeschickte Bewerbungen, ohne Belohnungen doppelt gutzuschreiben. Ohne diese Datenbankaktualisierung bleibt die Map nutzbar; der Shop meldet einen Ladefehler und erlaubt keine Käufe.

## Punkte und Käufe

- Jede Bewerbung wird einmalig mit 100 Punkten belohnt, sobald sie abgeschickt wurde: Status `applied`, `interview`, `final_interview`, `offer` oder `rejected`, alternativ ein gesetztes `applied_at`.
- `saved`, `preparing` und `withdrawn` ohne Versanddatum erzeugen keine neue Belohnung. Bereits verdiente Punkte bleiben bei späteren Statuswechseln oder beim Löschen erhalten.
- Das Belohnungsjournal verhindert doppelte Gutschriften für dieselbe Bewerbungs-ID, auch bei erneutem Import.
- Straßen kosten 20, Blumenbeete 30, Zierbäume 40, Bänke 50, Brunnen 150 und Freizeitparks 500 Punkte.
- Die Datenbank prüft Preise und Guthaben. Ein Wallet-Lock serialisiert Käufe und Platzierungen desselben Nutzers. Wiederholte Kaufanfragen mit derselben UUID buchen nicht erneut ab.
- Käufe gehen zuerst ins Inventar. Abbrechen der Platzierung verliert keinen Gegenstand. Einlagern erstattet keine Punkte, bewahrt aber den Gegenstand für spätere Platzierung.

## Platzierung

Das gesamte Dorf ist bebaubar: X -10 bis 33, Z ab -7 bis zur mit der Bewerbungszahl wachsenden Dorfgrenze (mindestens 20). Die Position bezeichnet die linke obere Rasterzelle; der gesamte gedrehte Grundriss muss innerhalb der Fläche liegen. Dekoration kann auch zwischen Bewerbungsgebäuden stehen. Gegenstände, Häuser und Straßen dürfen sich nicht überlappen; der feste Dorfbrunnen und das Flussufer bleiben reserviert. Vorschau und Datenbank prüfen dieselben Grenzen.

Positionen können per Klick oder Touch auf der Map sowie über die X-/Z-Felder gewählt werden. Die Drehung erfolgt in 90-Grad-Schritten; erst „Platzieren“ speichert. Bereits platzierte Objekte lassen sich auf der Map oder im Inventar auswählen, verschieben und einlagern.

Bewerbungshäuser lassen sich im Detailfenster über „Haus verschieben“ versetzen. Vorhandene Straßenstücke können direkt auf der Map oder unter „Straßen verschieben“ ausgewählt werden. Diese Änderungen kosten keine Punkte. Nutzergebundene Positionen und Drehungen liegen in `map_layouts`; das Originalraster bleibt nur der Ausgangspunkt für noch nicht verschobene Objekte.

Die sechs Shopvorschauen werden einmalig als SVG aus denselben Three.js-Modellen gerendert, die auch auf der Map erscheinen. Sie benötigen keinen WebGL-Kontext. Ist WebGL im Browser deaktiviert, verwendet auch die Karte einen interaktiven SVG-Renderer; Auswahl, Kamera und Platzierung bleiben verfügbar, Echtzeitschatten entfallen.

Eine fehlende Shop-Funktion (etwa PostgREST-Code `PGRST202`) wird als ausstehende Einrichtung angezeigt. Nach diesem Fehler unterbleiben automatische Wiederholungen beim Fensterfokus. Nach dem Ausführen des Schemas den Shop über „Erneut laden“ erneut verbinden.

## Verschieben per Ziehen

Platzierte Gegenstände und Bewerbungshäuser lassen sich direkt auf der Map ziehen (`lib/map-drag.ts`, Drag-Logik in `application-map-world.tsx`):

- **Maus:** auf den Gegenstand drücken und ziehen (ab 4 px). Ziehen auf leerem Boden verschiebt weiter die Karte.
- **Touch:** kurz (ca. 350 ms) gedrückt halten, dann ziehen. Wer vorher wischt, verschiebt nur die Karte.
- **Vorschau:** halbtransparenter Geist plus Rasterfeld, grün = frei, rot = ungültig. Der Gegenstand rastet auf ganze Zellen ein und bleibt an der gegriffenen Stelle.
- **Abgelehnt** (springt zurück, Hinweis unten): außerhalb der Insel, Wasser/Brunnen, Straße oder Gegenstand darunter. Esc bricht ab. Straßen und Brücken sind nie ziehbar.
- **Speichern** beim Loslassen mit denselben RPCs wie „Platzieren“ (`map_move_object` bzw. `map_shop_place`), optimistisch mit Rollback bei Fehler. „Rückgängig“ (oder Strg+Z) setzt das letzte Verschieben zurück.
- **Tastatur:** Karte fokussieren, Gegenstand auswählen, Pfeiltasten verschieben um eine Zelle (rechts/links = X, unten/oben = Z) im Platzierungsmodus, Enter platziert, Esc bricht ab. Pfeiltasten außerhalb der Karte scrollen die Seite wie gewohnt.
- Im Platzierungsmodus verschiebt Ziehen nur die vorgemerkte Position; erst „Platzieren“ speichert.

## Sicherheit und Tests

RLS schützt die Tabellen. Angemeldete Nutzer haben direkten Lesezugriff nur auf ihre eigenen Wallets, Belohnungen und Gegenstände. Schreibzugriffe laufen über authentifizierte RPCs mit Eigentumsprüfung; Punkte können nicht direkt im Browser verändert werden.

`node --experimental-strip-types --test tests/map-shop.test.mjs` prüft die tatsächlichen SQL-Funktionen mit einer lokalen PostgreSQL-Engine (PGlite) sowie die Vorschau-Regeln. Dabei werden keine Daten im Supabase-Projekt verändert.