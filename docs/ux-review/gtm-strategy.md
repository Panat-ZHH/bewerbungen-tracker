# WendApply – Go-to-Market: Wie bekommen wir möglichst viele Schweizer Schulen? (Part B)

Stand: 2026-11-06. Quellen: WebSearch (Snippets, keine Volltextprüfung). Unsichere Fakten sind mit "(unsicher)" markiert. Preise für WendApply sind **Vorschläge**, keine Marktfakten.

## 0. Kurzfassung (TL;DR)

1. **Schüler:innen bleiben gratis, Lehrpersonen-Pilot gratis**, danach Schul-Lizenz. Erst Evidenz (3–5 Pilotklassen, Zahlen, Zitate), dann Preis.
2. **Einstieg: Berufswahl-Lehrpersonen Sek I, Kanton Zürich** (2./3. Sek). Das ist ein kleiner, klar adressierbarer Kreis; der Kanton hat bereits ein staatliches Portal (berufswahl.zh.ch), das Betriebe und Infos abdeckt, aber (nach unserer Recherche) kein Bewerbungs-*Tracking* mit Lehrpersonen-Sicht. Genau diese Lücke besetzen wir (unsicher: nicht im Detail geprüft, ob das Portal Bewerbungsstatus anbietet – vor Positionierung prüfen).
3. **Wichtigster Hebel = Lehrpersonen-Nutzen, nicht Schüler-Marketing**: Lehrperson sieht auf einen Blick, wer wie viele Bewerbungen/Schnupperlehren hat und wer Hilfe braucht. Dazu gratis Unterrichtsmaterial (Lektionsplan "Lehrstellensuche in 6 Wochen").
4. **Zeitfenster nutzen**: Berufsmesse Zürich 17.–21. Nov. 2026 (siehe 4.7), Hauptbewerbungsphase Jan–Okt. für Lehrbeginn. Das Schuljahr-Fenster für Pilotklassen ist **Nov 2026 – Jun 2027**.
5. **Datenschutz ist die Eintrittshürde Nr. 1** bei Schulen (Schülerdaten, Cloud). Ohne AVV/Datenschutz-Dokument, Hosting-Info (Supabase-Region!) und klare Rollen kein Rollout. Vor Outreach erledigen.

---

## 1. Ausgangslage / Markt

- **Problem ist real**: SRF berichtet von steigendem Druck auf Teenager bei der Lehrstellensuche ([SRF](https://www.srf.ch/news/schweiz/fruehe-berufswahl-der-druck-auf-teenager-bei-der-lehrstellensuche-steigt)).
- **Bestehende Landschaft** (alle laut Suchergebnissen, nicht tief geprüft):
  - **yousty.ch**: grösste Lehrstellenplattform, eigene Angabe >60'000 Lehrstellen, 4.9 Mio. Besuche/Jahr; Yousty-Umfrage 2026: 75.3 % der befragten Firmen erhalten Schnupper-Bewerbungen am liebsten per E-Mail oder via yousty ([Yousty FAQ](https://www.yousty.ch/de-CH/help), [Yousty Schnupperlehrumfrage 2026 (PDF)](https://cf-images.yousty.ch/pages%2F613%2Fdocuments%2Fc47ffef70948b9ed8412d7f14007688c%2FMedienmitteilung_I_Schnupperlehrumfrage_I_2026_1.pdf)). → Das ist ein **Börsen-Konkurrent** nur teilweise; wir sind der *Prozess-Tracker*, sie die *Börse*. Besser: Yousty als Quelle/Partner denken (Link-Import), nicht bekämpfen.
  - **berufsberatung.ch (SDBB)**: Berufsinfos, Tipps zu Schnupperlehre/Lehrstellensuche ([berufsberatung.ch](https://berufsberatung.ch/dyn/show/13772?id=9)).
  - **LENA**: nationale Lehrstellenbörse (laut [Kanton BS](https://www.bs.ch/node/13698), Snippet).
  - **schnuppy.ch**, **Lehre BeO** (Berner Oberland), kantonale Listen (SO): Schnupperplätze finden.
  - **berufswahl.zh.ch**: kantonales Portal seit 2019, kostenlos für Betriebe ([Kanton ZH 2021](https://www.zh.ch/de/news-uebersicht/medienmitteilungen/2021/10/berufswahlprozess-neue-digitale-moeglichkeiten-fuer-lehrbetriebe-und-jugendliche.html), [Netzwoche](https://www.netzwoche.ch/news/2021-10-06/kanton-zuerich-bietet-lehrbetrieben-neue-digitale-moeglichkeiten)). Staatlich = gratis-Konkurrenz und gleichzeitig **Türöffner/Partner**.
  - **Berufswahl-Fahrplan-App / Xeit-App** der Berufsberatung Zürich (2014/2016, [Netzwoche](https://www.netzwoche.ch/news/2016-01-12/xeit-entwickelt-app-fuer-die-berufsberatung-zuerich)); Alter/Status heute unsicher.
  - **Print/Hybrid**: Berufswahl-Portfolio (S&B Institut), Berufswahltagebuch (Jungo/Egloff), Wegweiser zur Berufswahl – gängige Lehrmittel; in ZH teils nur "zugelassen" bzw. Unterrichtshilfe ([ZH Bildungsrat 2008](https://www.zh.ch/de/bildungsdirektion/generalsekretariat-der-bildungsdirektion/bildungsrat/suche-bildungsratsbeschluesse/2008-brb-32-volksschule-berufswahl-aufnahme-des-berufswahl-portfolios-ins.html); aktueller Stand unsicher).
  - **Referenzmodell Deutschland**: *berufswahlapp* (NRW/BW) mit Lehrpersonen-Sicht auf Klassen-Portfolios, Aufgaben, Termine ([Land NRW](https://www.land.nrw/pressemitteilung/berufliche-orientierung-auf-hoehe-der-zeit-neue-berufswahlapp-startet-die)). Zeigt: Markt akzeptiert digitale Lehrpersonen-Sicht staatlich getragen. Kein Schweizer Konkurrent, aber Argumentationshilfe.
- **Lücke, die wir besetzen**: Die Schweizer Angebote helfen beim *Finden* von Stellen und *Informieren*. Was fehlt (Hypothese, in Pilot validieren): *Bewerbungsprozess-Management* (Status, Fristen, Absagen, Nachfassen) **plus Klassenübersicht für die Lehrperson**.

### Positionierung (ein Satz)
> "WendApply ist das Bewerbungs-Cockpit für die Lehrstellensuche: Jugendliche behalten den Überblick, Lehrpersonen sehen, wer Unterstützung braucht – gratis für Schüler:innen, Datenschutz nach Schweizer Standard."

Abgrenzung: **nicht** "noch eine Lehrstellenbörse" (yousty/LENA), **nicht** Berufsinfo (berufsberatung.ch), **nicht** Lehrmittel (Portfolio) – sondern *Workflow + Lehrpersonen-Sicht*. Integration statt Konkurrenz: Links aus yousty/LENA/Firmenseiten importieren.

---

## 2. ICP (Ideal Customer Profile) und Expansionspfad

**Stufe 0 (Pilot, Nov 2026–Jun 2027): Einzelne Berufswahl-/Klassenlehrpersonen Sek I, Kanton ZH**
- 2. und 3. Sek (A/B/C bzw. Niveaus), Fach "Berufliche Orientierung"/Berufswahlunterricht. In ZH wird Berufswahlvorbereitung fächerübergreifend unterrichtet (Quelle: Regierungsrat 2011 laut Suchergebnis; Aktualität unsicher). LP21-Kompetenzbezug "Berufliche Orientierung" (in OW als BO.4.3.3 zitiert, [ow.ch](https://www.ow.ch/_doc/409696)); ZH-Kürzel vor Verwendung prüfen (unsicher).
- Merkmale des Ideal-Pilotlehrers: digital offen, 1:1-Geräte oder Klassen-iPads, hat 2.–3. Sek-Klasse, ist unzufrieden mit Excel/Papier-Tracking, kann eigenständig entscheiden (Gemeindeschule vs. Stadt).

**Stufe 1 (Frühling–Sommer 2027)**: Weitere ZH-Schulen/Gemeinden, Winterthur, Zürcher Oberland; Schulleitung als Entscheider.
**Stufe 2 (Schuljahr 2027/28)**: Deutschschweiz (AG, SG, BE, LU, SO, BL) – Kanton-übergreifend gleiche Prozesse, aber unterschiedliche kantonale Berufswahl-Strukturen. Aargau/Solothurn haben fertige Berufswahl-Ordner (SO: [Berufswahlordner](https://so.ch/fileadmin/internet/dbk/dbk-abmh/Dokumente/bslb/Berufswahlordner/Kap1/Lehrerversion_Kapitel_1.pdf)) → Anschlussfähigkeit prüfen.
**Stufe 3**: Westschweiz/Tessin (Übersetzung FR/IT, andere Lehrstellenlogik, Mittelschul-Anteil höher) und **Sek II/Brückenangebote, BIZ, Motivationssemester, 10. Schuljahr** (hier oft hoher Bedarf pro Person – unsicher, im Pilot testen).

Käufer ≠ Nutzer: Nutzer = Schüler:in; Champion = Lehrperson; Entscheider = Schulleitung/Schulpflege (Gemeinde); Einflussnehmer = Datenschutz/ICT-Verantwortliche der Gemeinde. Auf Stufe 0 braucht es nur die Lehrperson (kostenlos), ab Lizenz die Schulleitung.

---

## 3. Pricing

### 3.1 Prinzipien
- **Schüler:innen: dauerhaft gratis** (sonst keine Verbreitung, Lehrperson kann nichts verlangen).
- **Lehrpersonen-Pilot: gratis**, zeitlich bis Ende Schuljahr 2026/27 zugesichert (schriftlich), damit keine "Pilot-Falle".
- **Bezahlt wird die Schule**, nicht die einzelne Lehrperson (Lehrpersonen zahlen praktisch nie privat; Budgetierung läuft über Schulpflege/Gemeinde).

### 3.2 Benchmarks (dünn – ehrlich)
- Es fanden sich **keine öffentlichen Schul-Lizenzpreise** für Schweizer Edtech in der Suche. Einzig ein Näherungswert: *time2learn* (E-Learning für Lehrbetriebe) CHF 81.60 pro Lernende/Jahr für Mitglieder, CHF 122.40 für Nicht-Mitglieder, exkl. MWST ([kibesuisse Preisliste](https://kibesuisse.ch/fileadmin/Dateiablage/kibesuisse_Dokumente/time2learn_Preisliste_DE.pdf)). Das ist Betriebs-, nicht Schulmarkt → nur Obergrenze/Orientierung.
- Tutopiya (Consumer-Nachhilfe) CHF 63/Jahr ([tutopiya.com](https://www.tutopiya.com/blog/international-school-fees/international-school-fees-switzerland-guide)) – nicht vergleichbar.
- **Aktion**: In den Pilotgesprächen aktiv nach Budget/Preisvorstellung fragen; Preisbenchmarks von Anbietern wie Klett/Lehrmittelverlag, Anton, Learningview, Moodle-Hosting, IServ, Schul-Admin-Tools (z.B. Schulnetz/Sdui) direkt anfragen (nicht recherchiert → unsicher).

### 3.3 Vorschlag (zu validieren)
| Stufe | Wer | Preis | Inhalt |
|---|---|---|---|
| Free (Schüler) | alle | 0 | Bewerbungs-Tracker, Vorlagen, Erinnerungen |
| Pilot-Lehrperson | 3–5 Klassen, bis Jun 2027 | 0 | Klassenübersicht, Aufgaben/Fristen, Material, Direktsupport |
| Klasse (Freemium, bleibt gratis) | Einzellehrperson | 0 | Klassenübersicht bis 1 Klasse / 30 Schüler:innen, ohne Export |
| Schul-Lizenz (ab Schuljahr 27/28) | Schule | **Richtwert CHF 3–6 pro Schüler:in/Jahr (Sek I) oder Pauschale CHF 490–1'490/Schule/Jahr** | mehrere Klassen, Schulleitungs-Dashboard (anonymisiert), Export, SSO (später), AVV, Support |
| Gemeinde/Kanton | Verbund | Verhandlung | Rahmenvertrag, Integration kantonale Portale |

Begründung: Beschaffung unter ~CHF 1'500 ist in vielen Gemeinden in Kompetenz der Schulleitung ohne Ausschreibung (Grenzwerte je Gemeinde verschieden – unsicher). Pauschale ist einfacher zu verkaufen als Pro-Kopf. **Beide Zahlen sind Hypothesen, keine Marktdaten.** Test: im Pilot fragen "Ab welchem Preis würden Sie es nicht mehr beantragen / ab welchem ist es 'zu billig, wirkt unseriös'?"

Alternative Quellen: Kantone/Berufsberatungen (BIZ) kaufen für alle Schulen (Rahmenvertrag), Stiftungen finanzieren Gratis-Zugang (siehe 8). Langfristig realistischster Weg zu *vielen* Schulen ist **ein Kanton oder ein Verband als Zahler/Empfehler**, nicht Schule-für-Schule-Verkauf.

---

## 4. Kanäle (nach Priorität, mit Aufwand/Wirkung)

### 4.1 Direktansprache Lehrpersonen (Priorität 1, Wochen 1–8)
- **LinkedIn / Instagram**: Lehrpersonen sind eher auf Instagram und in geschlossenen Facebook-Gruppen aktiv (Annahme, unsicher). Konkret: 100 Lehrpersonen Sek I ZH (Berufswahl, Klassenlehrer) per Namen identifizieren (Schulhaus-Websites: öffentliche Team-Seiten), persönliche Kurznachricht. **Hinweis: nichts ohne Freigabe von Panat versenden** (Hard Rule im Projekt).
- **Facebook-Gruppen** für Lehrpersonen (z.B. "Lehrpersonen Schweiz"-ähnliche Gruppen; Namen nicht verifiziert) → nur Mehrwert-Posts (gratis Lektionsplan), keine Werbung; Gruppenregeln beachten.
- **Pitch-Mail (Vorlage)**: 4 Sätze, 1 Screenshot der Klassenübersicht, Angebot "30 Min Demo + Pilotklasse gratis", Link auf Datenschutzseite. Ziel: 100 Kontakte → 10 Gespräche → 3–5 Pilotklassen (Conversion 3–5 % ist Schätzung).

### 4.2 Lehrpersonen-Verbände (Priorität 2, ab Woche 4)
- **ZLV** (Zürcher Lehrpersonenverband, ~4'500 Mitglieder, [Quelle Medienmitteilung 2024](https://files.designer.hoststar.ch/0b/ae/0bae3b2f-53ba-43fa-92e6-3510ecc0f607.pdf), Zuordnung unsicher), **LCH** (Dachverband; hat Stellungnahme zu Berufswahlunterricht Sek I, [LCH 2009](https://www.lch.ch/fileadmin/files_transfer/documents/Stellungnahmen/090817_Berufswahlunterricht_Sek_I.pdf) und Datensicherheits-Leitfaden mit Merkblättern, [LCH Leitfaden](https://www.lch.ch/fileadmin/user_upload_lch/Orientierung/Leitfaeden/Leitfaden_Datensicherheit_Anhang_7_Merkblaetter.pdf) → unser Datenschutzdokument daran ausrichten), **VPOD** (Gewerkschaft, Lehrpersonen-Sektion), **SER/SYNDICATS** in der Romandie später.
- Vorgehen: kein Verkauf, sondern *Beitrag*: Artikel für Verbandszeitschrift (ZLV "Schulblatt"/"Zürcher Lehrerinnen"? Titel unsicher), Gratis-Material im Mitglieder-Newsletter, Kurz-Webinar. Verbände empfehlen selten Produkte offiziell, aber Hinweise auf "nützliche Ressourcen" sind üblich.

### 4.3 Schulleitungen (Priorität 2–3, ab Lizenzphase)
- **VSLZH** (Verband Schulleiterinnen/Schulleiter Zürich; ~435 Mitglieder = ~65 % der ZH-Schulleitungen laut [Dokument](https://files.designer.hoststar.ch/67/20/67202fa2-4245-41db-bb6e-7360ba30c02b.pdf), Datierung unsicher), **VSLCH** (Dachverband, Zahlen unbekannt), **SKSL**-Konferenzen (kantonale Schulleiterkonferenzen). Zugang: Newsletter-Notiz, Slot an Fachtagung/Kantonal-Tagung, Referat "Digitale Berufswahlbegleitung – Erfahrungen aus Pilotklassen".

### 4.4 Berufsberatung / BIZ / Berufsbildungsämter (Priorität 1 Partner)
- BIZ-Fachpersonen besuchen Klassen (Zusammenarbeit Sek I, z.B. [SO](https://so.ch/verwaltung/departement-fuer-bildung-kultur-und-sport/amt-fuer-berufsbildung-mittel-und-hochschulen/berufs-studien-und-laufbahnberatung/unser-angebot/zusammenarbeit-sek-i/); ZH: [Infos für Fachpersonen](https://www.zh.ch/de/bildung/berufs-studien-laufbahnberatung/informationen-fachpersonen-berufsberatung.html)). Ziel: BIZ-Berater nutzt WendApply als "Nach dem BIZ-Besuch: Plan in WendApply" (Empfehlung, keine Integration nötig).
- **Amt für Jugend und Berufsberatung (AJB) ZH** und **Mittelschul- und Berufsbildungsamt (MBA)**: Gespräch über Anschluss an berufswahl.zh.ch (z.B. Link-Out). Rechnung: Wenn der Kanton uns als "ergänzendes Tool" erwähnt, ist das wertvoller als 50 Einzelschulen. Realistisch: Monate, nicht Wochen.
- **SBFI** (Bund): eher Sichtbarkeit/Fördergelder (z.B. Projektförderung Berufsbildung) – unsicher, ob für uns passend.

### 4.5 Lehrbetriebe / Gewerbe / KMU (indirekter Kanal)
- Gewerbeverband Kanton ZH, lokale Gewerbevereine, Branchenverbände: Betriebe *wollen* gut vorbereitete Bewerbende (vollständige Dossiers, pünktliche Rückmeldung). Pitch an Betriebe: "Bewerbende aus WendApply-Klassen melden sich strukturiert". Nutzen für uns: Glaubwürdigkeit + Empfehlung an Schulen. Nutzen für Betriebe nur bei sichtbarem Mehrwert → später (Phase 3), erst Schüler-/Lehrerseite beweisen.
- Yousty-Umfrage zeigt, wie Betriebe Bewerbungen bevorzugen (E-Mail/yousty) – **WendApply darf kein neuer Kanal für Betriebe werden**, sondern muss die Bewerbung in diese bestehenden Kanäle "füttern" (Dossier-Export, Mailvorlage).

### 4.6 Jugendverbände / Elternarbeit
- Jugendverbände (Pfadi, Jubla, Jugendarbeit Gemeinden), Elternräte: Streuverlust hoch; nur punktuell (Elternabend 2. Sek: "So unterstützen Sie Ihr Kind bei der Lehrstellensuche" – Eltern sind starke Multiplikatoren, laut Migros-Familienportal Teil des Berufswahlprozesses, [Famigros](https://famigros.migros.ch/de/kinder-und-jugendliche/schule-und-ausbildung/berufswahl/berufswahlprozess)).

### 4.7 Events / Messen (konkrete Termine, Stand heute)
- **Berufsmesse Zürich**: voraussichtlich **17.–21. Nov 2026**, Messe Zürich (Daten laut [MCH Planungshilfe](https://mam.mch-group.com/asset/839de016-dbaf-4670-8d3c-c22a3d722c28/Berufsmesse-Zurich-2026-Planungshilfe.pdf), [messen.de](https://www.messen.de/de/5007/zuerich/berufsmesse-zuerich/info); eine Bundesseite nennt 18.–22. – vermutlich Fehler, unsicher). Zielgruppe Jugendliche, Eltern, Lehrpersonen. **Als Aussteller zu teuer/zu früh**; stattdessen als Besucher: Gespräche mit Lehrpersonen/BIZ-Leuten, Flyer-Karte "Gratis Lektionsplan" (nur wo erlaubt). Schulklassen-Konzept nicht gefunden – beim Veranstalter anfragen.
- **Swissdidac/Worlddidac** (Bern, **24.–26. Nov 2027**, laut [Jufair-Eintrag](https://en.jufair.com/exhibition/10533/periodical/), Ausgabe 2026 nicht gefunden) → Zeitpunkt für Stufe 2/3 vormerken.
- **"Swiss Didacta"** gibt es in dieser Form nicht gesichert (didacta ist die deutsche Messe in Köln/Hannover/Stuttgart). Beim Auftrag genannt, aber **nicht verifiziert** → streichen oder durch Swissdidac ersetzen.
- **educa / ICT in Education / SwissEduc / SwissSkills**: Termine in der Suche **nicht gefunden** – direkt bei Veranstaltern prüfen (educa.ch; SwissSkills ist Berufsmeisterschaft, nächstes Mal vermutlich 2027 – unsicher). Kleinere Formate (Barcamps, ZH Tage der Berufsbildung, Pädagogische Hochschule ZH Tagungen, Fortbildungen PH Zürich/FHNW) sind für uns realistischer.
- **Swiss National EdTech Testbed Program** ([EPFL LEARN](https://learn.epfl.ch/en/initiatives/swiss-national-edtech-testbed-program), [Gebert Rüf](https://www.grstiftung.ch/en/funding/portfolio~grs-073-24~.html)): getragen von Swiss EdTech Collider + Jacobs Foundation + Gebert Rüf Stiftung; Schulen testen Edtech, Startups bekommen Feedback; >350 Testbeds an 130 Schulen im ersten Jahr (laut GRS). **Hochpriorität**: Kontakt mit Swiss EdTech Collider ([ZHAW](https://www.entrepreneurship.zhaw.ch/en/resources/swiss-edtech-collider)) aufnehmen; Bewerbungsprozess für Startups unklar (unsicher). Das liefert Pilotschulen *und* Evidenz *und* Glaubwürdigkeit.

### 4.8 Presse / PR
- Lokalpresse (Tagblatt Zürich, Zürcher Oberländer, Landbote), Fachpresse (Bildung Schweiz = LCH-Zeitschrift, Netzwoche), SRF Regional. Anlass erst, wenn **Zahl vorliegt** ("In 4 Pilotklassen haben 78 % mehr Bewerbungen als erwartet geschrieben" – nur wenn wahr). Vorher keine Presse; Angriffsfläche Datenschutz. Hook: Lehrstellensuche-Druck (SRF-Thema), "Bewerbungs-Saison", Schnuppersaison (laut Yousty-Medienmitteilungen jeweils im Herbst/Frühling).

---

## 5. Content & SEO

- **Suchintentionen** (Lehrpersonen & Eltern): "Bewerbungsdossier Vorlage Lehrstelle", "Schnupperlehre Bewerbung Muster", "Lehrstellensuche Checkliste", "Berufswahl Lektionsplan Sek", "Absage Lehrstelle was tun", "Nachfassen Bewerbung Lehrstelle".
- **Seiten** (auf wendapply.ch; deutsch zuerst): Ratgeber-Cluster *Lehrstellensuche* (8–10 Artikel), *Für Lehrpersonen* (Materialien, Download ohne Login), *Datenschutz & Schule* (ausführlich), *Pilotprogramm*.
- **Lead-Magnet**: PDF-Lektionsplan + Kopiervorlagen gegen E-Mail (Opt-in, Newsletter nur mit Einwilligung).
- Erwartung ehrlich: SEO braucht 4–8 Monate; im Pilotjahr wenig Hebel. Daher Content primär als *Verkaufsmaterial* für Direktansprache, SEO nebenbei.
- Konkurrenz im SERP: yousty, berufsberatung.ch, Lehrstellenportale – nicht schlagbar auf generischen Begriffen; Long-Tail zu "Dossier/Tracking/Nachfassen" möglich.

---

## 6. Gratis-Ressourcen für Lehrpersonen (Kern des Angebots)

**"Lehrstellensuche in 6 Wochen"** – Lektionsplan Sek I (2./3. Sek), je 1 Lektion/Woche + Hausaufgabe, an LP21 "Berufliche Orientierung" angelehnt (Kompetenzcodes für ZH vor Veröffentlichung prüfen, unsicher):
1. Wo stehe ich? Berufsziele, Plan A/B/C, Statusübersicht anlegen
2. Stellen finden (yousty, LENA, berufswahl.zh.ch, Firmenseiten), Schnupperlehren planen
3. Bewerbungsdossier (Lebenslauf, Motivationsschreiben, Zeugnisse) – Checkliste/Vorlagen
4. Kontakt aufnehmen: E-Mail/Telefon, Rollenspiel
5. Eignungstests/Vorstellungsgespräch üben
6. Auswerten: Absagen verarbeiten, nachfassen, Plan B
- Dazu: Dossier-Vorlagen (Word/Docs), Elternbrief (Info + Einwilligung), Plakat "Meine Bewerbungsphasen", Quiz/Checkliste.
- Format: PDF + editierbar; **ohne WendApply nutzbar**, aber mit Aktivitäten, bei denen WendApply den Schritt erleichtert (Soft-Lock-in, keine Pflicht – Lehrpersonen mögen keine Produktwerbung im Unterricht).
- Qualitätssicherung: von 1–2 Berufswahllehrpersonen gegenlesen lassen (+Testimonial/Co-Autor), idealerweise BIZ-Fachperson.

---

## 7. Pilotprogramm (3–5 Klassen)

**Ziel**: Belegbarer Nutzen + Fehler finden + Zitate. **Dauer**: 8 Wochen ab Start (Start ASAP, Nov 2026–Jan 2027, bevor Schnupper-/Bewerbungsphase Fahrt aufnimmt; zweite Welle Feb–Apr 2027).

**Auswahl**: 3–5 Klassen, gemischt: 1 Stadt ZH, 1 Agglo, 1 Land, mind. 1 Niveau B/C (andere Bedürfnisse), mind. 1 Lehrperson mit Skepsis (liefert ehrlichstes Feedback).

**Wie finden** (Reihenfolge):
1. Persönliches Netzwerk (Panat: eigene Lehrpersonen/Wendico-Kontakte, ehemalige Schule – höchste Konversion).
2. Swiss EdTech Testbed / Collider (4.7).
3. Direktansprache aus 4.1 (100 Kontakte).
4. BIZ-Berater:innen fragen: "Welche Lehrpersonen sind offen?"
5. PH Zürich / FHNW Fortbildungskurse Berufswahl (Teilnehmende ansprechen).

**Pilot-Deal** (schriftlich, 1 Seite): gratis bis Ende Schuljahr, direkter Draht (WhatsApp/Signal der Gründer – Datenschutz beachten), 30-Min-Einführung, Feedback-Termin alle 2 Wochen, Erlaubnis Zitat (anonymisiert falls nötig), **Elterninformation + Einwilligung** (Vorlage von uns), Datenlöschung nach Pilot auf Wunsch.

**Metriken**: Aktivierungsrate (% Schüler:innen mit ≥1 Eintrag in Woche 1), Einträge/Schüler:in, wöchentliche Rückkehr (Wochen 2–8), Lehrperson-Logins/Woche, Zeitersparnis laut Lehrperson, NPS Lehrperson + Schüler, "Würden Sie dafür bezahlen? Wieviel?". Ehrlich auch negative Befunde berichten.

**Erfolgskriterien** (Vorschlag, anpassbar): ≥60 % der Schüler:innen mit ≥3 Einträgen; ≥2 von 3 Lehrpersonen wollen im nächsten Jahr weitermachen; ≥1 Schulleitung fragt nach Preis.

---

## 8. Partnerschaften

| Partner | Idee | Realismus |
|---|---|---|
| BIZ / AJB ZH | Empfehlung/Verlinkung, Fachpersonen-Schulung | mittel, langsam |
| Lehrmittelverlag Zürich / Verlage (S&B Institut, Klett etc.) | WendApply als Digitalbeilage zu Berufswahl-Lehrmitteln; Lehrmittelverlag ZH ist staatlich | schwierig (Verlage eigene Digitalstrategie), aber Test wert |
| Gewerbeverband / Branchenverbände | Empfehlung an Mitglieder-Betriebe, "Bewerbende aus WendApply" | mittel |
| Grossfirmen mit Lehrlingsprogrammen (Swisscom, UBS u.a.) | Sponsoring Gratis-Zugang, Vortrag in Klassen; Nutzen für sie: Nachwuchs-Branding | mittel; Reputations-/Neutralitätsfrage (Schulen mögen keine Firmenwerbung) |
| Yousty / LENA | Link-Import / Deep-Links statt Konkurrenz | kann Türöffner oder Konflikt sein – früh klären |
| Swiss EdTech Collider / Jacobs Foundation | Testbed, Netzwerk, Förderung | hoch priorisiert |

Hinweis: Konkrete Programme von Swisscom/UBS wurden nicht recherchiert → vor Outreach Programmseiten prüfen (unsicher).

---

## 9. Förderung / Finanzierung

(Alle Programme mit aktueller Ausschreibung prüfen; Suche lieferte nur Teilinfos.)
- **Gebert Rüf Stiftung** (Pionierprojekte an Schnittstelle Technologie/Bildung; ca. CHF 15 Mio./Jahr Fördertopf laut Suchergebnis, [grstiftung.ch](https://www.grstiftung.ch/en/the-foundation.html)); **InnoBooster** (bis CHF 150'000, 1.5 Jahre, aber nur für Hochschul-Startups mit Venture-Kick-Schritt 2 und Endorsements; Frist 1. Sep 2026 laut [BioAlps](https://bioalps.org/innobooster-gebert-ruf-stiftung/)) → **vermutlich nicht zugänglich**, außer Hochschul-Anbindung.
- **Swiss National EdTech Testbed** (GRS + Jacobs) – Pilotzugang, kein Geld direkt (unsicher).
- **Innosuisse**: Innovationsschecks/Projekte brauchen Forschungspartner (Hochschule); Edtech-Programm nicht gefunden → prüfen, ob ein Projekt mit PH oder ZHAW realistisch ist.
- **Stiftung Mercator Schweiz**: aktuell Studien zu Digitalisierung/Demokratie (Mai 2026) – kein Edtech-Startup-Programm gefunden → eher nicht passend (unsicher).
- **Weitere Kandidaten, nicht recherchiert (unsicher)**: Jacobs Foundation, Migros-Kulturprozent/Engagement Migros, Stiftung Mercator, Pro Juventute, Avenir Suisse (Ideenpool), Jugend-Innovationsförderung kantonal, Stiftung Pestalozzi, Förderung Berufsbildung SBFI-Projektbeiträge, Kantone "Lehrstellenförderung". **Auftrag**: separater Rechercheschritt (1–2 Tage) + Förderliste mit Fristen.
- Realismus: Förderung typischerweise für *Evidenz & Verbreitung* (Pilot-Studie mit PH/Uni), nicht für Betriebskosten. Kombination Pilot + Begleitstudie mit PH Zürich ist stärkstes Förderargument.

---

## 10. Referral-Loops (Produkt-Features, die Wachstum treiben)

1. **Schüler lädt Klasse ein**: Klassencode/Link (Teacher-Rolle existiert auf Branch teacher-role); Schüler können Freunde einladen ("Zusammen bewerben").
2. **Klasse lädt Schule ein**: nach 30 Tagen Nutzungsbericht "Klasse 3b: 24 Schüler, 112 Bewerbungen" → Lehrperson kann Bericht der Schulleitung weiterleiten (Ein-Klick-PDF, anonymisiert).
3. **Lehrperson lädt Kolleg:innen ein**: "Zweite Berufswahl-Lehrperson einladen" → beide erhalten Schul-Dashboard gratis.
4. **Eltern-Sicht** (optional, Datenschutz prüfen): Elternbrief führt zu Info-Seite.
- Wichtig: Datenschutz-konform – keine Weitergabe von Kontakten ohne Einwilligung; Schüler < 16: Einwilligung der Eltern ist rechtlich zu klären (kantonale Regeln, unsicher).

---

## 11. Datenschutz & Vertrauen (Gate vor Outreach)

- Schulen scheuen Cloud-Dienste mit Schülerdaten; Merkblätter existieren (privatim Cloud-Computing-Merkblatt 2013, [AG](https://www.ag.ch/media/kanton-aargau/dvi/dokumente/ges/organisation/idag/merkblaetter/merkblatt-cloud-computing-in-schulen.pdf); [LCH Leitfaden Datensicherheit](https://www.lch.ch/fileadmin/user_upload_lch/Orientierung/Leitfaeden/Leitfaden_Datensicherheit_Anhang_7_Merkblaetter.pdf); [Datenschutz-Leitfaden Zug 2026](https://zg.ch/dam/jcr:5be6dd5c-b7a6-4f0d-9d97-d5c0df82cd62/Datenschutz-Leitfaden%20f%C3%BCr%20gemeindliche%20Schulen_2026.pdf)). Verbindliche ZH-Regel zu Anbieterverträgen: nicht gefunden → Datenschutzbeauftragten ZH (dsb.zh.ch) direkt befragen.
- **Pflicht-Paket**: Datenschutzerklärung (CH-DSG/revDSG, ZH-IDG), Auftragsbearbeitungs-Vertrag (AVV) auf 2 Seiten, Hosting-Angabe (Supabase-Region EU? Schweiz? → klar benennen, Standardvertragsklauseln), Löschkonzept, Rollen (Schule = verantwortlich, WendApply = Auftragsbearbeiter), kein Tracking/Werbung, Minimaldaten, Elternbrief-Vorlage.
- Account-Löschung (Branch delete-account) ist ein **Verkaufsargument** – prominent kommunizieren.

---

## 12. Sequenzierter Fahrplan

**Phase 0 – Vorbereitung (jetzt bis ~Mitte Nov 2026, 2 Wochen)**
- Produkt: Teacher-Rolle stabil (Branch teacher-role in main nach Freigabe), delete-account live, Datenschutz-Dokumente, Klassencode-Onboarding < 5 Min.
- Material: Pitch-Mail, Ein-Pager, 3 Screenshots, Demo-Video 90 s, Lektionsplan v1 (6 Wochen, Rohfassung).
- Recherche: Förderliste, Termine (educa, ICT, SwissSkills), berufswahl.zh.ch-Funktionsprüfung, Preisbenchmarks anfragen.

**Phase 1 – Pilot-Rekrutierung (Mitte Nov – Ende Dez 2026)**
- Netzwerk + 100 Kontakte (nach Freigabe!), Berufsmesse-Besuch 17.–21. Nov (Gespräche), Kontakt Swiss EdTech Collider, BIZ-Gespräch.
- Ziel: 3–5 Pilotklassen unterschrieben, Start Jan 2027.

**Phase 2 – Pilot (Jan – Mär 2027)**
- 8 Wochen, Metriken, 2-wöchentliche Feedbacks, wöchentliche Produkt-Fixes.
- Parallel: Lektionsplan v2 mit Pilotlehrpersonen, 1 Artikel-Entwurf an ZLV/"Bildung Schweiz".

**Phase 3 – Evidenz & Multiplikation (Apr – Jun 2027)**
- Fallstudie/PDF (2 Seiten, Zahlen + Zitate), Preisvalidierung, Referral-Features live.
- Vorstellung bei VSLZH/Schulleiter-Anlass, Verband-Newsletters, Förderanträge einreichen (mit Pilotdaten), ggf. Kooperation PH Zürich.
- Ziel: 15–25 weitere Klassen / 5–8 Schulen in ZH, 1–2 Zahlungszusagen.

**Phase 4 – Lizenz & Expansion (Aug 2027 ff.)**
- Schuljahr 27/28: Lizenzangebot, Rahmenvertrag-Gespräche mit Gemeinden/Kanton, Expansion AG/SG/BE; Swissdidac 24.–26. Nov 2027 (Bern) als Sichtbarkeitsziel; Französisch ab 2028.
- Ziel-Hypothese Jahr 1 (Schuljahr 27/28): 30–60 Schulen (Annahme; abhängig von Piloterfolg und Kantonspartner). **Schätzung, keine Prognose.**

---

## 13. Risiken & offene Fragen

1. **Datenschutz/Elterneinwilligung** kann Rollouts verzögern.
2. **Staatliches Gratis-Angebot** (berufswahl.zh.ch, BIZ-App) – Lehrpersonen bevorzugen "Offizielles". Gegenmassnahme: Partnerschaft statt Konkurrenz.
3. **Saisonalität**: Nutzung konzentriert auf Herbst–Frühling; Umsatz erst nach Schuljahrwechsel.
4. **Lehrpersonen-Zeit**: jeder zusätzliche Schritt kostet Adoption; Onboarding < 5 Min Pflicht.
5. **Schülerverhalten**: Jugendliche nutzen Tools nur, wenn Lehrperson Pflicht/Anreiz setzt (Pilot messen!).
6. **Geschäftsmodell**: Schulen zahlen wenig und langsam; mögliche Alternative Kanton/Stiftung als Zahler.
7. **Unverifizierte Annahmen** in diesem Dokument (alle mit "unsicher" markiert) vor Aussenwirkung prüfen. Namen von Facebook-Gruppen, Preisen, Förderprogramm-Details, Event-Terminen (educa, ICT in Education, SwissSkills) wurden **nicht** verifiziert.

## 14. Nächste 5 konkrete Schritte (diese Woche)

1. Prüfen, was berufswahl.zh.ch genau bietet (Bewerbungsstatus? Lehrpersonen-Sicht?) → schärft Positionierung.
2. Datenschutz-Paket (Erklärung, AVV, Hosting-Info, Elternbrief) erstellen.
3. Liste von 30 Pilot-Kandidaten aus dem Netzwerk von Panat sammeln (persönliche Kontakte zuerst).
4. Swiss EdTech Collider/Testbed kontaktieren (Entwurf; Versand nach Freigabe).
5. Lektionsplan "Lehrstellensuche in 6 Wochen" v1 (1 Seite Gliederung → 6 Seiten) schreiben.
