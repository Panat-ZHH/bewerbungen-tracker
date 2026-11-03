# Stellen und Lehrstellen suchen

Die Seite `/search` ruft externe Anzeigen erst nach Absenden eines Berufs und
optional eines Schweizer Orts ab. Lehrstellen kommen von Yousty, Jobs von jobs.ch.
Es gibt keinen Hintergrund-Crawl, keine ungefilterte Stellensammlung und keine
automatische Speicherung der Ergebnisse. "Merken" speichert einen einzelnen Treffer
in der bestehenden Bewerbungs-Tabelle. Eine SQL-Migration ist nicht erforderlich.

## Recherche und Entscheidung

- [JobSpy](https://github.com/speedyapply/JobSpy) verwendet Suchparameter wie
  Beruf und Ort, quellspezifische Adapter und ein gemeinsames Ergebnisformat mit
  `job_url`. Das Muster wird hier mit Node.js und Cheerio umgesetzt, ohne Python-
  Dienst, Browser-Farm oder Proxy-Rotation.
- [jobs.ch robots.txt](https://www.jobs.ch/robots.txt) sperrt unter anderem `/api/`
  und `/api_proxy/`. Der Adapter verwendet nur das öffentliche Such-HTML unter
  `/de/stellenangebote/?term=...&location=...` und extrahiert die vorhandenen
  `data-cy="job-link"`-Links, Firma und Ort. Keine Detailseiten werden gecrawlt.
- [Yousty robots.txt](https://www.yousty.ch/robots.txt) sperrt unter anderem
  Autocomplete-/Berufs-API-Pfade. Der Adapter löst den Berufs-Slug aus dem
  [öffentlichen Berufsverzeichnis](https://www.yousty.ch/de-CH/lehrstellen/berufe)
  auf. Den Ort bestimmt ein HEAD-Request ohne Abruf einer ungefilterten Liste.
  Danach wird eine berufsspezifische HTML-Ergebnisseite geladen, beispielsweise
  `/de-CH/lehrstellen/ZH/Zuerich/1712-informatiker-in-efz`.

Beide Quellen wurden mit "Informatiker" in "Zürich" live getestet. robots.txt wird
zur Laufzeit geprüft und je Prozess für eine Stunde zwischengespeichert. Ein
robots.txt-Zugriff ist keine Nutzungslizenz: Vor einem kommerziellen oder größeren
Betrieb muss die Wiederverwendung mit den Anbietern geklärt werden. Siehe
[Yousty Nutzungsbestimmungen](https://www.yousty.ch/de-CH/nutzungsbestimmungen) und
[jobs.ch Nutzungsbedingungen](https://www.jobs.ch/de/nutzungsbedingungen/).

## Betrieb auf Netlify

- Die vorhandenen Supabase-URL und Publishable-Key-Umgebungsvariablen werden auch
  serverseitig benötigt. Kein Service-Role-Key und keine neue Scraper-API-Key nötig.
- `/api/job-search` ist ein Node.js Route Handler, kein statischer Export.
- Der Endpunkt prüft den Supabase-Token. Ein leerer oder ungültiger Suchbegriff
  startet keinen Quellenabruf. Pro Prozess gilt ein Abstand von zehn Sekunden
  zwischen Suchen eines Nutzers. Diese In-Memory-Bremse ist kein globales Limit
  über mehrere Netlify-Instanzen; für größere Nutzung ein persistentes Rate Limit
  oder eine Plattformregel ergänzen.
- Je Suche wird nur die erste passende Ergebnisseite gelesen, maximal 20 Treffer.
  Jede Anfrage hat einen Timeout, HTML-Antworten sind auf 4 MB begrenzt.
  Keine Captchas, Logins oder IP-Sperren werden umgangen.
- Ergebnislinks führen zur konkreten Originalanzeige. Die Bewerbung erfolgt dort,
  gegebenenfalls nach Weiterleitung zum Arbeitgeber. Die App bewirbt sich nicht
  automatisch.

## Grenzen und Tests

Berufe werden anhand der öffentlichen Yousty-Slugs aufgelöst. Bei allgemeinen
Begriffen wird der kürzeste passende Berufs-Slug ausgewählt, bei Fachrichtungen
der entsprechende spezifische. Freitext wie "Arbeit am Computer" ist keine
semantische Berufssuche. Orte sind die von Yousty auflösbaren Schweizer Ortsnamen;
es gibt aktuell keinen Umkreis- oder Lehrbeginnfilter und keine weiteren Seiten.
jobs.ch verwendet die Relevanz- und Ortslogik des Portals; Treffer können auch aus
der Umgebung kommen. Die Verfügbarkeit zum Bewerben ist auf der Originalseite zu
prüfen.

Tests: `npm test`, danach `npm run lint` und `npm run build`.
Parser-Tests decken Original-URLs, Duplikate, Fremdlinks, Feldextraktion,
Berufsauflösung, robots-Sperren und Anfrage-Reihenfolge ab.