# Stellen und Lehrstellen suchen

Die Seite `/search` ruft externe Anzeigen erst nach Absenden eines Berufs und
optional eines Schweizer Orts ab. Lehrstellen kommen aus Yousty und jobs.ch;
Jobs aus jobs.ch und jobup.ch. Die Quellen werden parallel und mit eigenen
Seitenzeigern durchsucht.
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
  Lehrstellenanfragen ergänzen "Lehrstelle" im Suchbegriff und übernehmen nur
  Anzeigen mit dem ausdrücklich ausgewiesenen Vertragstyp "Lehrstelle".
- [jobup.ch robots.txt](https://www.jobup.ch/robots.txt) erlaubt die öffentliche
  HTML-Suche unter `/fr/emplois/?term=...&location=...`, aber keine internen APIs.
  Das Portal verwendet dasselbe öffentliche Trefferformat wie jobs.ch und
  liefert insbesondere Stellen aus der französischsprachigen Schweiz.
  Suchbegriffe und Titel werden nicht automatisch übersetzt.
- [Yousty robots.txt](https://www.yousty.ch/robots.txt) sperrt unter anderem
  Autocomplete-/Berufs-API-Pfade. Der Adapter löst den Berufs-Slug aus dem
  [öffentlichen Berufsverzeichnis](https://www.yousty.ch/de-CH/lehrstellen/berufe)
  auf. Den Ort bestimmt ein HEAD-Request ohne Abruf einer ungefilterten Liste.
  Danach wird eine berufsspezifische HTML-Ergebnisseite geladen, beispielsweise
  `/de-CH/lehrstellen/ZH/Zuerich/1712-informatiker-in-efz`.

Die drei Quellen wurden mit "Informatiker" live getestet; die bisherigen
berufs- und ortsspezifischen Yousty-/jobs.ch-Tests bleiben bestehen. robots.txt wird
zur Laufzeit geprüft und je Prozess für eine Stunde zwischengespeichert. Ein
robots.txt-Zugriff ist keine Nutzungslizenz: Vor einem kommerziellen oder größeren
Betrieb muss die Wiederverwendung mit den Anbietern geklärt werden. Siehe
[Yousty Nutzungsbestimmungen](https://www.yousty.ch/de-CH/nutzungsbestimmungen) und
[jobs.ch Nutzungsbedingungen](https://www.jobs.ch/de/nutzungsbedingungen/).

## Betrieb auf Netlify

- Die vorhandenen Supabase-URL und Publishable-Key-Umgebungsvariablen werden auch
  serverseitig benötigt. Kein Service-Role-Key und keine neue Scraper-API-Key nötig.
- `/api/job-search` ist das serverseitige Such-Backend als Node.js Route Handler,
  kein statischer Export. Ein zusätzlicher Backend-Server ist nicht erforderlich.
- Der Endpunkt prüft den Supabase-Token. Ein leerer oder ungültiger Suchbegriff
  startet keinen Quellenabruf. Pro Prozess sind zwölf Such-/Nachladeanfragen pro
  Minute und Nutzer möglich. Diese In-Memory-Bremse ist kein globales Limit
  über mehrere Netlify-Instanzen; für größere Nutzung ein persistentes Rate Limit
  oder eine Plattformregel ergänzen.
- Pro Such-/Nachladeanfrage werden bis zu 25 neue Treffer gesammelt, bei Bedarf
  aus mehreren Quellenseiten. `nextCursor` enthält pro Quelle Seitenzahl und
  Position innerhalb der Seite. "Mehr laden" verwendet die zuvor abgeschickte
  Suche und übergibt bereits angezeigte Ergebnisse als `knownResults`. Neue
  Treffer und Quellen-Ergänzungen (`updates`) kommen getrennt zurück. Die UI
  übernimmt beides ohne eine bereits sichtbare Stelle doppelt anzuzeigen.
  Der Scraper konstruiert alle Quellenseiten selbst, nie aus einer
  vom Client übergebenen URL.
- Eine Quellenrunde liest höchstens fünf Ergebnisseiten pro aktivem Portal;
  eine Anfrage ergänzt die 25 Treffer in höchstens vier Runden und dauert
  insgesamt höchstens 45 Sekunden.
  Falls die Quelle weniger Treffer hat, endet die Liste entsprechend früher.
  Bei einem Folgefehler werden bereits gefundene Treffer mit Warnung und einer
  Fortsetzung zum Wiederholen zurückgegeben. Jede einzelne Anfrage hat zusätzlich
  einen Timeout; HTML-Antworten sind auf 4 MB begrenzt.
  Keine Captchas, Logins oder IP-Sperren werden umgangen.
  Höchstens drei kanonische Weiterleitungen innerhalb derselben Domain sind
  erlaubt; robots.txt wird für jeden Zielpfad geprüft.
- Ergebnislinks führen zur konkreten Originalanzeige. Die Bewerbung erfolgt dort,
  gegebenenfalls nach Weiterleitung zum Arbeitgeber. Die App bewirbt sich nicht
  automatisch.

## Duplikate und Quellen

Eine Stelle besitzt einen primären Original-Link und eine Liste weiterer
benannter Quellenlinks. Identische URLs werden immer zusammengeführt.
Übereinstimmende normalisierte Titel, Betrieb und Ort werden konservativ
zusammengeführt. Häufige Zusätze wie "Lehrstelle als", Geschlechtermarkierungen,
Rechtsformen und PLZ werden für den Vergleich vereinheitlicht; Fachrichtungen
bleiben relevant. Unterschiedliche explizite Jahrgänge bleiben getrennt, auch
wenn der erste Titel noch kein Jahr enthielt. Fehlende Betrieb-/Ortsangaben oder
mehrdeutige Treffer erlauben keinen unsicheren Titelvergleich. Abweichende freie
Formulierungen oder Übersetzungen können deshalb weiterhin getrennt erscheinen.

Wenn eine Quelle eine bereits sichtbare Stelle erst später findet, aktualisiert
`updates` deren Quellenliste statt einen neuen Treffer anzuhängen. Die Oberfläche
zeigt alle Originalanzeigen anklickbar. "Merken" prüft alle Quellen-URLs und
speichert die zusätzlichen Links in den Bewerbungsnotizen.

Quellenausfälle werden mit Portalname angezeigt. Andere Quellen liefern weiter
Treffer; der Zeiger der ausgefallenen Quelle bleibt für "Mehr laden" erhalten.

## Grenzen und Tests

Berufe werden anhand der öffentlichen Yousty-Slugs aufgelöst. Bei allgemeinen
Begriffen wird der kürzeste passende Berufs-Slug ausgewählt, bei Fachrichtungen
der entsprechende spezifische. Freitext wie "Arbeit am Computer" ist keine
semantische Berufssuche. Orte sind die von Yousty auflösbaren Schweizer Ortsnamen;
es gibt aktuell keinen Umkreis- oder Lehrbeginnfilter. Bis zu 1000 Quellenseiten
und 10000 bereits angezeigte URLs werden pro Suchlauf unterstützt; Nachladeanfragen
speichern keinen sitzungsabhängigen Serverzustand und funktionieren auch auf
wechselnden Netlify-Instanzen.
jobs.ch verwendet die Relevanz- und Ortslogik des Portals; Treffer können auch aus
der Umgebung kommen. Die Verfügbarkeit zum Bewerben ist auf der Originalseite zu
prüfen.

Tests: `npm test`, danach `npm run lint` und `npm run build`.
Parser-Tests decken Original-URLs, Duplikate, Fremdlinks, Feldextraktion,
Berufsauflösung, robots-Sperren, Anfrage-Reihenfolge, 25er-Batches, Seitenreste,
Duplikate zwischen Batches, das Listenende und wiederholbare Folgefehler ab.
Weitere Tests prüfen quellenübergreifende Duplikate, spätere Quellen-Ergänzungen,
getrennte Jahrgänge, Quellen-Ausfälle und sichere kanonische Weiterleitungen.