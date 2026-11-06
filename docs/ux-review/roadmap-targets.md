# WendApply – Roadmap, KPIs, Outreach-Material, Risiken, Budget, 50 Ziele (Part B6)

Stand: 2026-11-06. Ergänzt `gtm-strategy.md` (Positionierung, ICP, Pricing). Alle Zahlen für WendApply sind **Planwerte/Annahmen**, keine Marktfakten. Rechtliche Aussagen (Datenschutz) sind **keine Rechtsberatung** und vor Versand von einer Fachperson zu prüfen (unsicher). URLs in Abschnitt (g) wurden am 2026-11-06 per HTTP-Abruf geprüft (Status 200 nach Redirects); Ausnahmen sind markiert.

Annahmen: Ein-Personen-Team (Panat, nebenher/teilzeit), Start Kanton Zürich, Pilot kostenlos, Lehrstellen-Hauptsaison: Bewerbungen Aug–Jan für Lehrbeginn im Folgesommer, Schnupperlehren ganzjährig, Berufsmesse Zürich **17.–21. Nov. 2026** (bestätigt auf [berufsmessezuerich.ch](https://www.berufsmessezuerich.ch/de)).

---

## (a) 30/60/90-Tage-Plan und 12-Monats-Roadmap

### Voraussetzung (Woche 0–2, vor jedem Outreach – "Gate")
Ohne diese Punkte kein Versand an Schulleitungen:
1. Datenschutzerklärung + Kurzdokument "Datenschutz für Schulen" (1 Seite): Datenkategorien, Zweck, Hosting-Standort (Supabase-Region prüfen/ggf. EU-Region Frankfurt; **unsicher, aktuell nicht verifiziert**), Löschkonzept, Sub-Prozessoren, Kontakt.
2. Lehrpersonen-Rolle (Branch `teacher-role`) nach `main` gemerged und stabil; Konto-Löschung (Branch `delete-account`) live – Schulen fragen als Erstes: "Kann ich Daten löschen lassen?"
3. Einwilligungs-/Altersfrage klären (Schüler:innen Sek I sind meist 13–16; Einwilligung der Eltern bzw. Schule als Auftraggeberin) – 1 Stunde bei kantonalem Datenschutzbeauftragten/Anwalt (unsicher, was ZH verlangt).
4. Demo-Klasse mit Fake-Daten (kein echtes Schülerdatum in Demos), Demo-Video 3 Min.
5. Eine Landingpage `/schulen` (Nutzen, Datenschutz, Pilot-Anmeldung), eine Kontaktadresse (`schulen@…`, keine Privatadresse).

### Tage 1–30 (Nov 2026): Vorbereiten + 5 Gespräche
- Gate-Punkte abschliessen (oben).
- 10 persönliche Kontakte (Bekannte Lehrpersonen, Ex-Lehrer, Berufsschule) um 20-Min-Gespräch bitten – Ziel: **5 Gespräche, 2 Pilotzusagen**.
- Berufsmesse Zürich (17.–21. Nov.) **als Besucher** nutzen: 30 Gespräche mit Lehrpersonen/Klassen, die mit Schulklassen kommen, plus Berufsberater:innen am BIZ-Stand; Flyer/QR mit `/schulen`. Kein Ausstellerstand (zu teuer, siehe Budget).
- Kontakt zu 3 Multiplikatoren aufnehmen (ZLV, BIZ Zürich, PHZH-Dozierende Berufswahl) – nur Informationsanfrage, kein Verkauf.
- Messgrösse: Anzahl geführter Gespräche, Pilot-Zusagen.

### Tage 31–60 (Dez 2026): Pilot starten
- **3 Pilotklassen** (2.–3. Sek) onboarden: 45-Min-Einführung in der Klasse (Lehrperson führt, Panat anwesend), Aufgabenblatt "Erste 3 Bewerbungen erfassen".
- Wöchentlicher 15-Min-Check mit jeder Pilotlehrperson; Bugs binnen 48 h.
- Unterrichtsmaterial "Lehrstellensuche in 6 Wochen" (Lektionsplan, 6×45 Min) fertig und gratis.
- Pilotvereinbarung (siehe (c)) mit Schulleitung/Lehrperson unterzeichnet **vor** Erfassung von Schülerdaten.
- Zielwerte Ende Tag 60: 3 Klassen, ≥ 60 Schüler:innen aktiv, ≥ 150 erfasste Bewerbungen/Schnupperlehren.

### Tage 61–90 (Jan 2027): Evidenz + Skalierung vorbereiten
- Auswertung: Aktivierungsquote, Wochen-Nutzung, Lehrpersonen-Feedback (NPS + 3 offene Fragen), 2 Zitate mit Freigabe.
- Einseitiger "Pilotbericht" (anonymisiert) – wichtigstes Verkaufsdokument.
- 10 weitere Schulen anschreiben (Schulleitungen + Lehrpersonen, Vorlagen (c)), Fokus Referenz: "Schule X im Kanton ZH nutzt es".
- Preisgespräche testen (nur fragen, nicht verkaufen): "Was wäre für Ihre Schule ein fairer Jahrespreis?"
- Zielwerte Ende Tag 90: **8 Klassen, 10 Lehrpersonen aktiviert, 200 Schüler:innen, 3 Schulen mit Folgeinteresse**.

### 12-Monats-Roadmap (bis Nov 2027)
| Quartal | Fokus | Meilensteine |
|---|---|---|
| Q4 2026 | Gate, Pilot-Start | Datenschutz-Doku, 3 Pilotklassen, Berufsmesse-Besuch |
| Q1 2027 | Pilot ausweiten (ZH) | Pilotbericht, 10 Klassen, 2 PHZH/Verband-Kontakte, erstes Referenzzitat |
| Q2 2027 | Schulen statt Einzelpersonen | Schulleitungs-Dashboard (anonymisiert), AVV-Vorlage, 3 Schulen mit Absichtserklärung zur Lizenz, Antrag Stiftungsförderung eingereicht |
| Q3 2027 | Lizenz-Start für Schuljahr 27/28 | Erste bezahlte Schul-Lizenzen (Ziel 3–5), Einführung in Schulen vor Sommerferien, Material-Update, Winterthur/Zürcher Oberland |
| Q4 2027 | Zweiter Kanton | Pilot in AG oder SG, Berufsmesse-Auftritt (Mini-Stand/Workshop), Jahresbericht, Entscheid: Ausbau/Teilzeit→Vollzeit/Partnerschaft Kanton |

Entscheidpunkte (Go/No-Go): **Ende Jan 2027** – falls < 2 Pilotklassen aktiv oder Aktivierung < 40 %, Fokus wechseln (z. B. Berufsberatung BIZ, 10. Schuljahr/Brückenangebote statt Sek I). **Ende Juni 2027** – falls keine Schule Zahlungsbereitschaft zeigt, auf Stiftung/öffentliche Förderung statt Schul-Lizenz umstellen.

---

## (b) KPIs und Funnel

### Funnel (Planwerte, Annahme: Cold-Outreach-Antwortquote 5–10 %, Persönlich/Empfehlung 30–50 %)
| Stufe | Definition | 90 Tage | 6 Monate | 12 Monate |
|---|---|---|---|---|
| Kontaktiert | Lehrpersonen/Schulleitungen angeschrieben/gesprochen | 60 | 200 | 500 |
| Gespräch/Demo | 10-Min-Demo gehalten | 12 | 40 | 100 |
| **Aktivierte Lehrpersonen** | Konto + ≥ 1 Klasse angelegt + ≥ 5 Schüler:innen eingeladen | 6 | 15 | 40 |
| **Klassen** | Klasse mit ≥ 8 aktiven Schüler:innen | 8 | 25 | 70 |
| **Schüler:innen (registriert)** | Konto, Klasse zugeordnet | 200 | 600 | 1'600 |
| **Wöchentlich aktive (WAU)** | ≥ 1 Aktion in 7 Tagen | 90 (45 %) | 300 (50 %) | 800 (50 %) |
| **Erfasste Bewerbungen** | Einträge (Bewerbung/Schnupperlehre) | 600 | 3'000 | 10'000 |
| **Lehrstellen gefunden** | Status "Zusage Lehrstelle" (selbst gemeldet) | – | 25 | 150 |
| Zahlende Schulen | Lizenz/Absichtserklärung | 0 | 1 | 5 (3–5) |
| Umsatz (CHF) | | 0 | 0–1'500 | 5'000–12'000 (Annahme: 5 Schulen × ~1'000–2'400) |

### Qualitäts-KPIs
- **Aktivierungsquote Schüler:innen** (≥ 3 Einträge innerhalb 14 Tagen nach Einladung): Ziel ≥ 50 %.
- **Retention W4** (aktiv in Woche 4 nach Registrierung): ≥ 35 %.
- **Lehrpersonen-NPS**: ≥ +30; **Zeit bis erste Klassenübersicht** < 10 Minuten.
- **Support-Last**: < 3 h/Woche pro 100 aktive Schüler:innen.
- **Datenschutz**: 0 Vorfälle; 100 % der Pilotklassen mit unterschriebener Vereinbarung.
- **Leading-Indikator**: Anzahl Lehrpersonen, die WendApply von sich aus Kolleg:innen empfehlen (Ziel: 1 Empfehlung pro 3 Piloten).

Messung: Supabase-Abfragen auf aggregierte Zahlen (keine Personendaten ins Reporting), wöchentliches Dashboard (Google Sheet/Metabase), Datenschutz: nur anonymisierte Kennzahlen für Berichte.

---

## (c) Outreach-Material (Deutsch)

> Wichtig: Alle Vorlagen sind **Entwürfe**. Nichts versenden ohne Freigabe von Panat. Cold-E-Mails an Personen: nur berufliche Adressen aus öffentlichen Schulseiten, kurz, mit Abmeldemöglichkeit (UWG Art. 3 Abs. 1 lit. o – Massenwerbung; vor Serienversand Rechtslage prüfen, unsicher).

### c1) E-Mail an Lehrpersonen (Berufswahl, 2./3. Sek)
**Betreff:** Bewerbungs-Überblick für Ihre 3. Sek – kostenloser Pilot

Guten Tag [Anrede Name]

Wie behalten Sie den Überblick, wer in Ihrer Klasse schon wie viele Bewerbungen und Schnupperlehren hat? Viele Lehrpersonen berichten mir von Excel-Listen und Nachfragen in der Pause.

Ich bin Panat Ruangsri, Entwickler in Zürich, und habe mit **WendApply** ein Werkzeug gebaut, mit dem Jugendliche ihre Lehrstellensuche selbst verwalten (Status, Fristen, Erinnerungen, Vorlagen) und Sie auf einen Blick sehen, wer Unterstützung braucht.

– für Schüler:innen und Lehrpersonen **kostenlos** (Pilot bis Sommer 2027)
– Daten in [Hosting-Region], keine Werbung, keine Weitergabe, Löschung jederzeit
– inkl. fertigem Lektionsplan "Lehrstellensuche in 6 Wochen"

Hätten Sie 15 Minuten für eine Kurz-Demo? Ich komme gern bei Ihnen vorbei oder zeige es per Videocall. Wenn das gerade nicht passt: kein Problem, eine kurze Rückmeldung genügt.

Freundliche Grüsse
Panat Ruangsri · WendApply · [Telefon] · [schulen@…] · wendapply.ch

(Wenn Sie keine weiteren Nachrichten wünschen, antworten Sie einfach mit "Nein danke".)

### c2) E-Mail an Schulleitungen
**Betreff:** Pilotangebot: digitale Unterstützung der Lehrstellensuche (kostenlos, datenschutzkonform)

Sehr geehrte Frau / sehr geehrter Herr [Name]

Die Lehrstellensuche ist für Schüler:innen der 2./3. Sek ein Kraftakt, und Lehrpersonen betreuen sie oft mit Papier und Excel. **WendApply** ist ein Schweizer Werkzeug, mit dem Jugendliche Bewerbungen und Schnupperlehren strukturiert verwalten und Lehrpersonen den Stand ihrer Klasse sehen.

Wir suchen für das Schuljahr 2026/27 **1–3 Pilotklassen** im Kanton Zürich:
– kostenlos, keine Verpflichtung zur späteren Lizenz
– schriftliche Pilotvereinbarung mit Datenschutzklauseln (im Anhang)
– Löschung aller Daten auf Wunsch jederzeit, spätestens 30 Tage nach Pilotende
– Auswertung (anonymisiert) für Ihre Schule

Gerne stelle ich das Vorhaben in 15 Minuten vor oder an einer Lehrerkonferenz. Das Datenschutzdokument finden Sie unter [Link].

Freundliche Grüsse
Panat Ruangsri · [Kontakt]

Anhang: Einseiter, Pilotvereinbarung (Entwurf), Datenschutzblatt.

### c3) LinkedIn-Nachricht an Lehrpersonen (max. 300 Zeichen für Kontaktanfrage)
> Guten Tag [Name], ich entwickle WendApply, ein kostenloses Tool für die Lehrstellensuche (Klassenübersicht für Lehrpersonen). Ich suche 1–3 Pilotklassen in der Sek im Kt. ZH. Hätten Sie Interesse an einer 15-Min-Demo? Freundliche Grüsse, Panat

Folge-Nachricht (nach Annahme, kein Pitch-Klotz): "Danke fürs Vernetzen! Kurz: WendApply zeigt Ihnen, wer in Ihrer Klasse schon Bewerbungen/Schnupperlehren erfasst hat – Schüler:innen verwalten ihre Suche selbst. Ich habe ein 3-Min-Video: [Link]. Passt ein Austausch in den nächsten Wochen?"

### c4) LinkedIn-Nachricht an Schulleitungen
> Guten Tag [Name], ich unterstütze Schulen bei der digitalen Begleitung der Lehrstellensuche (WendApply, Pilot kostenlos, mit Datenschutzvereinbarung). Darf ich Ihnen die Eckpunkte in 10 Min vorstellen? Freundliche Grüsse, Panat Ruangsri

### c5) One-Pager (Text für A4)
**WendApply – Das Bewerbungs-Cockpit für die Lehrstellensuche**

*Für Jugendliche:* Alle Bewerbungen und Schnupperlehren an einem Ort – Status, Fristen, Notizen, Erinnerungen, Vorlagen für Bewerbungsschreiben. Auf dem Handy nutzbar.

*Für Lehrpersonen:* Klassenübersicht auf einen Blick: Wer hat bewerbt, wer wartet auf Antwort, wer braucht Unterstützung? Keine Excel-Listen, kein Nachfragen in der Pause. Fertiger Lektionsplan "Lehrstellensuche in 6 Wochen" inklusive.

*Für Schulleitungen:* Anonymisierte Kennzahlen für die Berufswahlbegleitung; kostenloser Pilot; keine IT-Installation (läuft im Browser).

*Datenschutz:* Daten in [Region], nur Zweck Lehrstellensuche, keine Werbung, keine Weitergabe, Löschung jederzeit, schriftliche Vereinbarung.

*Kosten:* Schüler:innen dauerhaft gratis. Pilot gratis bis Sommer 2027. Danach optional Schul-Lizenz [Preis nach Pilot].

*Kontakt:* [Name, E-Mail, Telefon, wendapply.ch/schulen]

### c6) Pilotvereinbarung (kurz, Entwurf – vor Gebrauch juristisch prüfen)

**Pilotvereinbarung WendApply**

Zwischen **[Schule / Gemeinde, Adresse]** ("Schule") und **Panat Ruangsri, [Adresse]** ("Anbieter").

1. **Zweck und Dauer.** Der Anbieter stellt der Schule die Anwendung WendApply kostenlos zur Unterstützung der Lehrstellensuche in der Klasse [X] bereit, vom [Datum] bis [30.06.2027]. Danach endet die Nutzung ohne weitere Verpflichtung; eine Lizenz wird nur nach separater Vereinbarung geschuldet.
2. **Verantwortung.** Die Schule bleibt verantwortliche Stelle für die Bearbeitung von Schülerdaten; der Anbieter bearbeitet Personendaten **nur im Auftrag** und nach Weisung der Schule (Auftragsbearbeitung, Art. 9 revDSG; kantonales Datenschutzrecht, IDG ZH – unsicher, im Detail prüfen).
3. **Datenkategorien.** Name oder Pseudonym, Klasse, E-Mail (falls für Login nötig), erfasste Bewerbungsdaten (Betrieb, Beruf, Status, Notizen). Keine besonders schützenswerten Daten; Schüler:innen werden angewiesen, keine solchen (Gesundheit, Religion) in Notizen zu erfassen.
4. **Zweckbindung.** Verwendung ausschliesslich für den Betrieb der Anwendung. Kein Verkauf, keine Werbung, kein Profiling, kein Training von KI-Modellen mit Schülerdaten.
5. **Speicherort und Unterauftragnehmer.** Hosting: [Anbieter/Region, z. B. Supabase, EU/Schweiz – bestätigen]. Die Schule erhält eine Liste aller Unterauftragnehmer und wird über Änderungen vorab informiert.
6. **Sicherheit.** Verschlüsselte Übertragung (TLS), Zugriffskontrolle nach Rolle (Lehrperson sieht nur ihre Klassen), Zugriffsschutz auf Datenbankebene (Row Level Security), nur nötige Administratorzugriffe, Protokollierung.
7. **Rechte der Betroffenen.** Auskunft, Berichtigung und Löschung werden innert 10 Arbeitstagen unterstützt; Schüler:innen können ihr Konto jederzeit selbst löschen.
8. **Meldung von Vorfällen.** Der Anbieter meldet Datenschutzverletzungen unverzüglich, spätestens innert 48 Stunden, an die Schule.
9. **Löschung.** Spätestens 30 Tage nach Pilotende oder auf Verlangen werden alle Daten der Klasse gelöscht oder (wenn gewünscht) in einem Export übergeben; schriftliche Bestätigung.
10. **Einwilligung / Information.** Die Schule informiert Schüler:innen und Eltern (Vorlage des Anbieters) und holt, falls nach kantonaler Praxis nötig, die Einwilligung der Eltern ein.
11. **Auswertung.** Der Anbieter darf anonymisierte, aggregierte Kennzahlen (nicht auf Person oder Klasse rückführbar) zur Verbesserung und für Berichte verwenden; Namen der Schule nur mit schriftlicher Freigabe.
12. **Haftung / Verfügbarkeit.** Pilotbetrieb "best effort", keine Garantie der Verfügbarkeit; Haftung beschränkt auf grobe Fahrlässigkeit und Vorsatz, soweit gesetzlich zulässig.
13. **Kündigung.** Jederzeit mit 7 Tagen Frist, schriftlich oder per E-Mail; Löschung gemäss Ziffer 9.
14. **Recht und Gerichtsstand.** Schweizer Recht; Gerichtsstand [Ort der Schule].

Ort, Datum · Unterschrift Schule (Schulleitung) · Unterschrift Anbieter

---

## (d) 10-Minuten-Demo-Skript (Lehrperson/Schulleitung)

Vorbereitung: Demo-Klasse mit 12 fiktiven Schüler:innen, 2 Geräte (Laptop Lehrperson-Ansicht, Handy Schüler-Ansicht), Backup-Video.

| Min | Inhalt | Satz / Handlung |
|---|---|---|
| 0:00–1:00 | **Problem** | "Frage: Wie wissen Sie heute, wie weit Ihre Klasse bei den Bewerbungen ist? – Meist: Excel, Nachfragen, Zettel." |
| 1:00–2:30 | **Schüler-Sicht (Handy)** | Neue Bewerbung in 20 Sekunden erfassen (Betrieb, Beruf, Link, Frist). Status ändern: "beworben → Antwort ausstehend → Schnupperlehre". Erinnerung zeigen. |
| 2:30–4:00 | **Vorlagen & Hilfen** | Bewerbungsschreiben-Vorlage, Checkliste "Was gehört in die Bewerbung". "Das Handy erinnert, nicht Sie." |
| 4:00–6:30 | **Lehrpersonen-Sicht (Laptop)** | Klassenübersicht: 3 Schüler:innen ohne Eintrag (rot), 4 mit Absage (Unterstützung nötig), 2 mit Zusage. Filter nach Status. "Ein Blick statt 25 Gespräche." |
| 6:30–7:30 | **Datenschutz** | Wer sieht was; Hosting-Region; Löschung per Klick; Pilotvereinbarung. "Schüler:innen sehen nur sich selbst." |
| 7:30–8:30 | **Unterricht** | Lektionsplan "6 Wochen" – 1 Seite zeigen; Einführung dauert 45 Min. |
| 8:30–9:30 | **Pilot-Angebot** | Kostenlos bis Sommer 2027, keine Verpflichtung, 15-Min-Check pro Woche von uns, Auswertung am Ende. |
| 9:30–10:00 | **Nächster Schritt** | "Welche Klasse käme infrage? Wann ist die nächste Berufswahl-Lektion?" Termin direkt fixieren. |

Typische Einwände und Antworten: "Wir haben schon berufswahl.zh.ch / Portfolio" → "WendApply ersetzt das nicht, es ergänzt: es führt den Bewerbungsprozess und zeigt der Lehrperson den Stand" (Abgrenzung vor dem Gespräch prüfen: bietet berufswahl.zh.ch bereits Status-Tracking? **unsicher**). "Datenschutz?" → Dokument zeigen. "Schüler:innen haben keine Geräte" → läuft auf Handy/Schul-iPad im Browser; Papierausdruck der Klassenliste als Fallback.

---

## (e) Risikoliste

| Risiko | Wahrscheinlichkeit | Auswirkung | Massnahme |
|---|---|---|---|
| **Datenschutz** (Minderjährige, Cloud, Schülerdaten, Hosting ausserhalb CH, Sub-Prozessoren) | hoch | sehr hoch (Aus für Schulen) | Gate vor Outreach; Datensparsamkeit (Pseudonym statt Klarname möglich); EU/CH-Region; AVV/Pilotvereinbarung; Löschfunktion; Kontakt zu kantonalem Datenschutz früh (Anfrage, nicht Verkauf); jährlicher externer Review; Pentest/Checkliste (RLS-Policies testen) |
| **Vertrauen** (unbekannter Einzelanbieter, "Warum gratis?") | hoch | hoch | Referenz-Lehrperson, Transparenz (Wer steckt dahinter, wie finanziert), Open-Source-Teile oder Code-Audit, Stiftung/Verbands-Empfehlung, Pilotbericht |
| **Konkurrenz** (berufswahl.zh.ch kantonal gratis, yousty/LENA, Lehrmittelverlage, Portfolio) | mittel | mittel–hoch | Nische: Prozess + Lehrpersonen-Sicht; Integration statt Konkurrenz (Link-Import); Partnerschaft mit Kanton/BIZ statt Wettbewerb; klare Differenzierung nach Pilot validieren |
| **Schul-IT blockiert** (Filter, nicht freigegebene Dienste, Login nur via Microsoft/Google-Schulkonto) | mittel | hoch | Browser-only ohne Installation; Domain-Freigabe-Liste mitliefern; später SSO (Microsoft Entra/Google); Handy-Zugang als Fallback; früh IT-Verantwortliche involvieren |
| **Single-Founder-Risiko** (Ausfall, Überlastung, Bus-Faktor 1) | hoch | hoch | Dokumentation, automatische Backups + Restore-Test, 2. Person als Notfallkontakt (Vertrag: Datenexport/Löschung auch bei Ausfall), Einkauf von Entwickler-Stunden, Fokus (nur ZH), klare Support-Zeiten, "Escrow"/Exit-Klausel in Lizenzvertrag |
| **Zahlungsbereitschaft fehlt** (Gemeinde-Budgets, Beschaffungsregeln) | mittel | hoch | Früh Preis testen; Stiftungsfinanzierung; Pauschale unter Vergabeschwelle (öffentliches Beschaffungsrecht, Schwellenwerte prüfen, unsicher) |
| **Saisonalität** (Aktivität nur Aug–Jan) | mittel | mittel | Pilot früh (Nov), 10. Schuljahr/Brückenangebote/Berufsschule als Ganzjahresgruppe, Schnupperlehren ganzjährig |
| **Reputationsschaden** durch Fehler (falsche Sichtbarkeit Lehrer/Schüler) | niedrig | sehr hoch | Rollen-Tests automatisiert, Staging, Release-Checkliste, Incident-Plan (48 h Meldung) |
| **Rechtliche Unklarheit** (Einwilligung Eltern, kantonales IDG) | mittel | mittel | 1–2 h Anwaltsberatung Schul-/Datenschutzrecht (Budget); Vorlagen von educa/privatim sichten |
| **Wettbewerb um Aufmerksamkeit** (Lehrpersonen überlastet) | hoch | mittel | Zero-Setup (Klassencode statt Listen-Import), 10-Min-Demo, Material fertig mitliefern |

---

## (f) Budget 12 Monate (Schätzung, CHF)

Annahmen: Panat arbeitet unbezahlt/nebenher (Lohnkosten **nicht** eingerechnet); Preise ohne MWST, Richtwerte (unsicher; vor Ausgabe Offerten holen).

| Posten | Annahme | CHF |
|---|---|---|
| Hosting/Infra (Netlify, Supabase Pro, Domain, E-Mail, Monitoring) | ~ 60–120/Mt | 700–1'400 |
| Rechtsberatung (Datenschutz, Pilot-/Lizenzvertrag, AVV-Vorlage) | 4–8 h à 250–350 | 1'000–2'800 |
| Datenschutz-/Sicherheits-Review (Pentest-light, RLS-Check) | extern 1–2 Tage | 1'500–4'000 |
| Design/Material (Flyer, One-Pager, Lektionsplan, Demo-Video) | Freelancer | 800–2'500 |
| Reisen (Schulbesuche ZH, Messe) | 30 Termine × ~20–40 | 600–1'200 |
| Berufsmesse Zürich: Eintritt Besucher | wenige Tage | 0–100 (unsicher) |
| Mini-Stand/Workshop Berufsmesse 2027 (Option) | Stand teuer (unsicher, Offerte bei MCH nötig) | 0–5'000 |
| Marketing (Landingpage, Google-Ads-Test, Druck) | klein | 500–2'000 |
| Versicherung (Betriebshaftpflicht/Cyber) | | 400–1'200 |
| Buchhaltung/Treuhand (falls Einzelfirma/GmbH) | | 500–1'500 |
| Support-Tools (Helpdesk, Analytics datenschutzfreundlich) | | 200–600 |
| Reserve (10–15 %) | | 800–2'400 |
| **Total (ohne Messestand)** | | **ca. 7'000–19'000** |
| **Total (mit Messestand)** | | **ca. 12'000–24'000** |

Finanzierung: Eigenmittel, Stiftungen (Gebert Rüf, Mercator, Jacobs, Migros-Kulturprozent – je Gesuch prüfen, Fokus Bildungsinnovation/Berufsbildung), Innosuisse-Innovationsscheck (unsicher, Eignung prüfen), später Schul-Lizenzen (Ziel 5'000–12'000 CHF im ersten Verkaufsjahr).

---

## (g) 50 konkrete erste Ziele (Kontakt-Typen, Organisationen, öffentliche Kontaktseiten)

Es sind **Organisationen und öffentliche Anlaufstellen**, keine Privatpersonen. Status am 2026-11-06 per HTTP geprüft (✔ = Seite lädt, HTTP 200). Rolle = Kontakt-Typ, den man dort anspricht. Priorität A = in 30 Tagen, B = 90 Tage, C = später. Hinweis: **VSLCH** (Verband Schulleiterinnen und Schulleiter Schweiz) leitet auf visenti.ch weiter (Verband heisst jetzt *Visenti – Verband Schulführung Schweiz*).

### Lehrpersonen- und Schulleitungsverbände
| # | Organisation | Rolle / Anlass | URL | Prio |
|---|---|---|---|---|
| 1 | LCH – Dachverband Lehrerinnen und Lehrer Schweiz | Geschäftsstelle, Medien, Weiterbildung; Gastbeitrag/Newsletter | https://www.lch.ch/kontakt ✔ | B |
| 2 | ZLV – Zürcher Lehrerinnen- und Lehrerverband | Kantonaler Verband ZH, "ZLV-Magazin", Mitgliedernewsletter | https://www.zlv.ch/kontakt ✔ | A |
| 3 | Visenti (früher VSLCH) | Schulleitungsverband, Fachtagung/Newsletter | https://visenti.ch/kontakt/ ✔ | A |
| 4 | VSG – Verband Schweizerischer Gymnasiallehrerinnen und -lehrer | Gymnasium/Sek II (später) | https://www.vsg-sspes.ch/der-verein/kontaktformular ✔ | C |
| 5 | zebis – Zentralschweizer Bildungsportal | Bildungsportal Lehrpersonen Zentralschweiz, Materialverzeichnis | https://www.zebis.ch/ ✔ | C |
| 6 | Lehrmittelverlag Zürich (lmvz) | Berufswahl-Lehrmittel ZH, Kooperation/Verlinkung | https://www.lmvz.ch/ ✔ | B |
| 7 | S&B Institut (Berufswahl-Portfolio) | Anbieter Lehrmittel; Schnittstelle/Kooperation | https://www.s-b.ch/kontakt/ ✔ | B |
| 8 | Berufswahl-Portfolio (Portal) | Lehrpersonen, die bereits mit Portfolio arbeiten | https://www.berufswahl-portfolio.ch/ ✔ | B |

### Kanton Zürich: Verwaltung und Berufsberatung
| # | Organisation | Rolle / Anlass | URL | Prio |
|---|---|---|---|---|
| 9 | Volksschulamt Kanton Zürich | Schulentwicklung, Berufswahl-/Digitalisierungsfragen | https://www.zh.ch/de/bildungsdirektion/volksschulamt.html ✔ | A |
| 10 | Amt für Jugend und Berufsberatung (AJB) | Trägerin der BIZ; Pilot-Kooperation | https://www.zh.ch/de/bildungsdirektion/amt-fuer-jugend-und-berufsberatung.html ✔ | A |
| 11 | BIZ Kanton Zürich (Berufs-, Studien- und Laufbahnberatung) | Berufsberater:innen an Schulen; Multiplikatoren | https://www.zh.ch/de/bildung/berufs-studien-laufbahnberatung.html ✔ (erreichbar auch via biz.zh.ch) | A |
| 12 | berufswahl.zh.ch (kantonales Portal) | Abgrenzung/Partnerschaft klären | https://berufswahl.zh.ch/ ✔ | A |
| 13 | Bildungsdirektion Kanton Zürich | Generalsekretariat, Digitalisierung | https://www.zh.ch/de/bildungsdirektion.html ✔ | B |
| 14 | Kanton Zürich Bildung (Portal) | Übersicht Volksschule/Berufsbildung | https://www.zh.ch/de/bildung.html ✔ | C |
| 15 | VZGV – Verband der Gemeindepräsidien/-schreiber ZH | Gemeinden als Schulträger (Zweck des Verbandes prüfen, **unsicher**) | https://www.vzgv.ch/ ✔ | C |
| 16 | Kanton Aargau, Departement BKS | Zweiter Kanton | https://www.ag.ch/de/ueber-uns/verwaltung/bks ✔ | C |
| 17 | Kanton St. Gallen, Bildung & Sport | Zweiter Kanton Ostschweiz | https://www.sg.ch/bildung-sport.html ✔ | C |
| 18 | Kanton Basel-Stadt, Erziehungsdepartement | Dritter Kanton | https://www.bs.ch/ed ✔ | C |

### National: Berufsbildung, Berufsberatung, Bildungsinformation
| # | Organisation | Rolle / Anlass | URL | Prio |
|---|---|---|---|---|
| 19 | SDBB – Schweiz. Dienstleistungszentrum Berufsbildung, Berufs-, Studien- und Laufbahnberatung | Betreiber berufsberatung.ch; Kooperation/Verlinkung | https://www.sdbb.ch/ ✔ | B |
| 20 | berufsberatung.ch | Tipps Lehrstellensuche; Verlinkung/Redaktion | https://www.berufsberatung.ch/de ✔ | B |
| 21 | berufsbildung.ch (Portal Berufsbildung) | Kontaktformular Redaktion | https://www.berufsbildung.ch/de/kontakt ✔ | C |
| 22 | educa.ch – Fachagentur für Bildungsinformatik | Datenschutz-/Standardfragen (z. B. Identitätsdienst), Bildungs-ICT | https://www.educa.ch/de/kontakt ✔ | A |
| 23 | SBFI – Staatssekretariat für Bildung, Forschung und Innovation | Berufsbildung national | https://www.sbfi.admin.ch/de ✔ | C |
| 24 | SKBF – Schweizerische Koordinationsstelle für Bildungsforschung | Forschung/Evaluationspartner | https://www.skbf-csre.ch/ ✔ | C |
| 25 | EHB – Eidg. Hochschule für Berufsbildung | Forschung Berufswahl/Berufsbildung | https://www.ehb.swiss/ ✔ | B |
| 26 | SFGB-B (Schweiz. Fachstelle für Berufsbildung, Bern; Zweck prüfen, **unsicher**) | Berufsbildungs-Fachstelle | https://www.sfgb-b.ch/ ✔ | C |
| 27 | education21 – Bildung für Nachhaltige Entwicklung | Weniger relevant; nur Netzwerk | https://www.education21.ch/de | C |
| 28 | SODK – Konferenz der kantonalen Sozialdirektoren | Brückenangebote/Jugendliche, Sozialpartner | https://www.sodk.ch/de/ ✔ | C |

### Wirtschaft und Berufsverbände
| # | Organisation | Rolle / Anlass | URL | Prio |
|---|---|---|---|---|
| 29 | Kantonaler Gewerbeverband Zürich (KGV) | Lehrbetriebe; Mitgliedernewsletter | https://www.kgv.ch/ ✔ | A |
| 30 | Schweiz. Gewerbeverband (SGV) | National; Kontaktformular | https://www.sgv-usam.ch/kontakt ✔ | B |
| 31 | Swissmem Berufsbildung | MEM-Industrie, Lehrstellen | https://www.swissmem-berufsbildung.ch/de/index.html ✔ | B |
| 32 | ICT-Berufsbildung Schweiz | ICT-Lehren (Informatik EFZ) | https://www.ict-berufsbildung.ch/ ✔ | B |
| 33 | GastroSuisse | Gastro-Lehren, Nachwuchs | https://gastrosuisse.ch/ ✔ | C |
| 34 | hotelleriesuisse | Hotel-Lehren | https://www.hotelleriesuisse.ch/de/ ✔ | C |
| 35 | Schweiz. Baumeisterverband | Bau-Lehren | https://baumeister.swiss/ ✔ | C |
| 36 | digitalswitzerland | Digitale Bildungsinitiativen, Netzwerk | https://www.digitalswitzerland.com/ ✔ | C |
| 37 | swissICT | Verband ICT, Lehrstellen-Initiativen | https://www.swissict.ch/ ✔ | C |
| 38 | yousty.ch | Börsenbetreiber; Integration/Link-Import statt Konkurrenz | https://www.yousty.ch/de-CH ✔ | B |
| 39 | LENA – Lehrstellennachweis | Börse; Kantonale Kooperation | https://www.lena.ch/ ✔ | C |
| 40 | schnuppy.ch | Schnupperlehr-Börse; Kooperation | https://www.schnuppy.ch/ ✔ | C |

### Messen, Wettbewerbe, Events
| # | Organisation | Rolle / Anlass | URL | Prio |
|---|---|---|---|---|
| 41 | Berufsmesse Zürich (MCH Group), 17.–21.11.2026 | Besuch, Gespräche mit Lehrpersonen/Berufsberatung; später Workshop/Stand | https://www.berufsmessezuerich.ch/de ✔ | A |
| 42 | SwissSkills | Berufsmeisterschaften, Kooperation Jugendliche | https://swiss-skills.ch/de/kontakt ✔ | C |
| 43 | Swissdidac (Bern) | Bildungsmesse für Lehrmittel/Schulbedarf | https://swissdidac-bern.ch/de ✔ (Kontaktunterseite fehlt, Hauptseite nutzen) | B |
| 44 | Worlddidac | Internationale Lehrmittelmesse/Verband | https://worlddidac.org/ ✔ | C |

### Pädagogische Hochschulen (Ausbildung, Weiterbildung, Forschung)
| # | Organisation | Rolle / Anlass | URL | Prio |
|---|---|---|---|---|
| 45 | PH Zürich (PHZH) | Dozierende Berufswahl/Digitalisierung; Weiterbildung; Praktikumsklassen | https://phzh.ch/ ✔ (Kontaktseite wechselt, über Startseite navigieren) | A |
| 46 | PH Bern | Zweite Region; Forschung zu Berufswahl | https://www.phbern.ch/ ✔ | B |
| 47 | PH FHNW | Nordwestschweiz, Weiterbildungsangebote | https://www.fhnw.ch/de/ph ✔ | B |
| 48 | PH St. Gallen / PH Thurgau / PH Luzern / PH Schwyz / PH Zug | Je Standort Dozierende ansprechen | https://www.phsg.ch/de ✔ · https://phtg.ch/ ✔ · https://www.phlu.ch/ ✔ · https://www.phsz.ch/ ✔ · https://www.zg.ch/behoerden/direktion-fur-bildung-und-kultur/phzg/ ✔ | C |

### Stiftungen / Förderer und Datenschutz-Stellen
| # | Organisation | Rolle / Anlass | URL | Prio |
|---|---|---|---|---|
| 49 | Gebert Rüf Stiftung (Gesuch), Stiftung Mercator Schweiz, Jacobs Foundation, Migros-Kulturprozent, Beisheim Stiftung | Förderung Bildungsinnovation; Gesuch einreichen, je Kriterien prüfen (unsicher, ob Edtech gefördert wird) | https://www.grstiftung.ch/de/kontakt.html ✔ · https://www.stiftung-mercator.ch/ ✔ · https://jacobsfoundation.org/ ✔ · https://engagement.migros.ch/de/kulturprozent ✔ · https://www.beisheim-stiftung.ch/ ✔ | B |
| 50 | Datenschutz: privatim (Konferenz der schweiz. Datenschutzbeauftragten), EDÖB, datenschutz.ch; swissfoundations (Stiftungsverband); Innosuisse | Auskunft Datenschutz Schulen, Fördermöglichkeiten | https://www.privatim.ch/de/kontakt/ ✔ · https://www.edoeb.admin.ch/de/kontakt ✔ · https://www.datenschutz.ch/ ✔ · https://www.swissfoundations.ch/ ✔ · https://www.innosuisse.admin.ch/de ✔ | A (Datenschutz) / C |

Nicht auflösbar/nicht gelistet (bei Prüfung 2026-11-06 nicht erreichbar oder 404): kantonaler Datenschutzbeauftragter ZH (`dsb.zh.ch` leitet auf 404 – Seite über zh.ch suchen), swissdidac.ch (404), edk.ch und sbbk.ch (HTTP 403 gegen Skript-Zugriff, im Browser vermutlich erreichbar – **unsicher**), pro-juventute.ch (403), biz.zh.ch (nur via Redirect, siehe #11), mehrere Verbände (VSL ZH u. a.) ohne Treffer; vor Kontakt manuell prüfen.

### Vorgehen mit der Liste
1. **A-Ziele (8)** zuerst: ZLV, Visenti, Volksschulamt, AJB/BIZ, berufswahl.zh.ch, educa, KGV, Berufsmesse, PHZH, Datenschutz-Stellen. Ziel: je ein Informationsgespräch, nicht Verkauf. Erwartung: 3 Antworten, 1 Multiplikator.
2. Pro Kontakt-Typ eine Anfrage-Vorlage aus (c) anpassen (Lehrperson-Variante für Verbände/PH, Schulleitungs-Variante für Gemeinden).
3. Nach Gespräch: CRM-Zeile (Org, Datum, Rolle, Nächster Schritt) – ohne Personendaten ausserhalb der Geschäftskontakte; Einwilligung für Speicherung von Kontaktdaten beachten.
4. Keine Cold-Mails an einzelne Privatpersonen ohne beruflichen Kontext; öffentlich auffindbare Schul-E-Mail-Adressen nur gezielt (keine Massenversendung).

## Quellen / Prüfmethode
- Alle URLs: `curl -L` (Status nach Redirect) am 2026-11-06; Berufsmesse-Daten aus der Seite selbst ([berufsmessezuerich.ch](https://www.berufsmessezuerich.ch/de)); VSLCH → Visenti aus der Weiterleitung und Seitentitel "Visenti – Verband Schulführung Schweiz" ([visenti.ch](https://visenti.ch/)).
- Preise und Budget: eigene Schätzung, keine Offerten (unsicher). Rechtliche Hinweise (revDSG, IDG ZH, UWG): Platzhalter, juristisch prüfen.
- Nicht geprüft: Inhalt/Eignung jeder Organisation im Detail (z. B. Zweck von VZGV, SFGB-B); Ansprechpersonen wurden bewusst nicht recherchiert.
