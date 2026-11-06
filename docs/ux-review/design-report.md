# WendApply – Design/UX-Kritik (Part A3)

Datum: 2026-11-06 · Rolle: Design/UX-Kritiker · Stand: Branch `main` (lokal) + Branch `teacher-role` (lokal, Kopie des Worktrees)

## 0. Methode und ehrliche Grenzen

- **Kein echtes Konto, keine echten Daten.** Beide App-Staende liefen lokal (`next dev`, Ports 3411 = main, 3413 = teacher-role-Kopie) mit dem vorhandenen **zustandsbehafteten Supabase-Stub** (`scripts/lib/mock-supabase.mjs`, Backend = `localhost:54321`, Dummy-Key). Es wurde also **kein Throwaway-Account angelegt und nichts geloescht werden muss**; Produktion und PRIVAT-Supabase wurden nicht beruehrt.
- **Dummy-Daten:** 8 Bewerbungen (Swisscom, UBS, Migros, …), Schueler "Lena Mueller", Lehrer "H. Keller", Klasse "Informatik 4a". Zahlen in den Screenshots (3500 Map-Punkte, 600/600 Insel) sind Stub-Werte, keine echten Metriken.
- **84 Screenshots** (21 Screens x {Desktop 1280x800, iPhone 390x844 @2x} x {hell, dunkel}) in [`design/`](design/), Namensschema `NN-screen-<desktop|iphone>-<light|dark>.png`. Erzeugt von [`design/shoot.mjs`](design/shoot.mjs).
- **Artefakt-Hinweis:** Die Vollseiten-Screenshots zeigen die mobile Tab-Bar mitten in der Seite und den Hintergrundverlauf nur bis 800 px – das ist ein Screenshot-Artefakt (fixed-Elemente bei `fullPage`), **kein App-Fehler**.
- **Nicht getestet/ausserhalb Stub:** echte Ladezeiten, echte Jobsuche-Ergebnisse (Stub liefert 1 Ergebnis), Screenreader-Praxis, Teacher-Onboarding im Detail (siehe Schwester-Berichte in [`teacher/`](teacher/) und [`student/`](student/)). Kontrastwerte sind aus Computed Styles mit **geschaetztem Hintergrund** berechnet (Verlaufshintergrund -> Naeherung), also Richtwerte.
- Die Skills `design:design-critique` / `design:accessibility-review` wurden nicht aufgerufen; Kriterien (Hierarchie, Konsistenz, WCAG 2.1 AA Kontrast/Touch-Targets) wurden manuell angewandt.
- **Wichtige Randnotiz zum Betrieb:** Am Ende habe ich Dev-Server mit einem zu breiten `pkill -f next-server/next dev` beendet. Das kann auch einen von einem anderen Helfer gestarteten Dev-Server auf Port 3347 (teacher-role) getroffen haben. Falls ein Schwester-Agent "Connection refused" auf 3347 sieht: neu starten. Es gingen keine Daten verloren.

Zentrale Screens (Auswahl):

| Screen | Desktop hell | iPhone dunkel |
|---|---|---|
| Dashboard | [04](design/04-dashboard-desktop-light.png) | [04](design/04-dashboard-iphone-dark.png) |
| Dashboard leer (Onboarding) | [03](design/03-dashboard-empty-desktop-light.png) | [03](design/03-dashboard-empty-iphone-dark.png) |
| Login | [02](design/02-login-desktop-light.png) | [02](design/02-login-iphone-dark.png) |
| Suche | [05](design/05-search-desktop-light.png) | [05](design/05-search-iphone-dark.png) |
| Bewerbungen / Detail | [06](design/06-applications-iphone-light.png) / [07](design/07-application-detail-desktop-light.png) | [07](design/07-application-detail-iphone-dark.png) |
| Map | [09](design/09-map-desktop-light.png) | [09](design/09-map-iphone-dark.png) |
| Freunde | [10](design/10-friends-desktop-light.png) | [10](design/10-friends-iphone-dark.png) |
| Einstellungen | [11](design/11-settings-desktop-dark.png) | [11](design/11-settings-iphone-dark.png) |
| Schueler: Klassen / Beitritt | [20](design/20-classes-student-desktop-light.png) / [21](design/21-class-join-desktop-light.png) | [20](design/20-classes-student-iphone-dark.png) |
| Lehrer: Uebersicht | [24](design/24-teacher-dashboard-desktop-light.png) | [24](design/24-teacher-dashboard-iphone-dark.png) |
| Lehrer: Klassen / Klassen-Detail | [22](design/22-classes-teacher-desktop-light.png) / [23](design/23-class-detail-teacher-desktop-light.png) | [23](design/23-class-detail-teacher-iphone-dark.png) |

## 1. Gesamteindruck (Kurzfassung)

WendApply ist **visuell deutlich besser als der typische Schul-/Berufswahl-Software-Standard**: ein konsequentes Design-System (Glas-Karten, Blau-Violett-Verlauf, Pill-Buttons, runde Chips), saubere Typografie (Inter-artig, enge Titel, kleine Versal-"Eyebrows"), gute Dark-Mode-Umsetzung und mit der isometrischen **Map** ein wirklich eigenstaendiges Alleinstellungsmerkmal. Die Mikrotexte sind warm und entlastend ("Ein guter naechster Schritt reicht fuer heute", "Du musst nicht alles auf einmal wissen").

Die Schwaechen liegen **nicht im Look, sondern in Struktur und Vertrauen fuer die Schulen-Zielgruppe**:

1. **Keine oeffentliche Landingpage.** `/` leitet auf `/login` weiter (siehe [01-landing](design/01-landing-desktop-light.png) – identisch mit Login). Eine Lehrperson, die einen Link bekommt oder googelt, sieht nur ein Login-Formular mit 3 Stichpunkten. Fuer "Schulen gewinnen" ist das die groesste Luecke (kein "Fuer Schulen", keine Datenschutz-Erklaerung vor dem Registrieren, keine Screenshots, kein Kontakt).
2. **Spielerisch vs. serioes ist uneinheitlich verteilt:** Schueler-Seite (Map, Punkte, Shop, "Daumen druecken!") ist verspielt; Lehrer-Seite ist nuechtern und ok – aber die **Teacher-Uebersicht zeigt 6 KPI-Kacheln, die bei 1280 px abgeschnitten sind** ("BEWERBUNG…", "LEHRSTELLE…") und im Leerzustand alle "0" zeigen.
3. **Die Kernfunktion Map ist mobil hinter "Mehr" versteckt** (5er Tab-Bar: Start, Suchen, Bewerbungen, Freunde, Mehr).
4. **Kleine Texte nahe an der AA-Grenze** (muted 11-12 px, ~4.5:1) und uneinheitliche Gender-/Du-Schreibweisen.

## 2. Visuelles Design im Detail

### 2.1 Konsistenz
- **+** Ein Karten-/Chip-/Button-System ueber alle Screens (Dashboard, Bewerbungen, Klassen, Settings). Status-Chips sind farbcodiert und in Hell+Dunkel lesbar ([06](design/06-applications-iphone-light.png), [04 dunkel](design/04-dashboard-iphone-dark.png)): In Vorbereitung = gelb, Abgeschickt = blau, Gespraech/Zusage = gruen, Abgelehnt = rot, Zurueckgezogen/Gemerkt = grau.
- **−** **Navigation uneinheitlich:** Desktop-Schueler hat 7 Tabs + 3 Icons (Start, Suchen, Bewerbungen, Map, Lebenslaeufe, Auswertung, Freunde, Klassen); Lehrer hat 2 Tabs ("Uebersicht", "Klassen"). Das Wort "Start" (Schueler) vs. "Uebersicht" (Lehrer) fuer dieselbe Rolle des Home-Screens; zudem Dashboard-Titel "Dein Ueberblick" (Schueler). Kleinigkeit, aber ein Lehrer-Schueler-Wechsel zeigt es.
- **−** **Eingabekontrollen gemischt:** Status-Aenderung im Detail ist ein **natives `<select>`** ([07](design/07-application-detail-desktop-light.png)), waehrend alles andere Pills/Segmented-Controls sind. Auf iOS oeffnet das den System-Picker – funktional, aber optisch ein Bruch.
- **−** **Schreibweise Personen/Anrede:** "Schueler:in" (Rollenwahl), "3 Schueler" (Klassenkarte), "Schuelerinnen und Schueler" (Teacher-Beschreibung), "SCHUELER" (KPI). Und **"Was Deine Lehrperson sieht" / "Was Deine Freunde sieht"** mit grossem D, waehrend ueberall sonst "dein/deine" klein steht ([20 iPhone dunkel](design/20-classes-student-iphone-dark.png), [10 iPhone hell](design/10-friends-iphone-light.png)). Zudem Grammatikfehler: "Was Deine Freunde **sieht**" (Plural -> "sehen").

### 2.2 Hierarchie
- **+** Dashboard: klare Dreiteilung Titel -> 3 Kennzahlen -> Liste -> "Bald faellig". Primaer-CTA "Bewerbung hinzufuegen" hat Verlauf+Schatten und ist das einzige "laute" Element ([04](design/04-dashboard-desktop-light.png)). Mobil steht er direkt unter dem Titel (gut).
- **−** **Freunde-Seite mobil: falsche Reihenfolge.** Einladungscode (gross, hellblau), "Freund:in hinzufuegen", zwei Freigabe-Schalter und die lange Datenschutz-Box ("Was Deine Freunde sieht", 9 Zeilen) kommen **vor** den offenen Anfragen und der Freundesliste ([10 iPhone hell](design/10-friends-iphone-light.png) – Seite ist ~2300 px hoch, die Anfrage "Sara Weber moechte mit dir befreundet sein" liegt erst bei ~60 % Scrolltiefe). Die Dringlichkeit (rotes Badge "1" im Tab) fuehrt zu einem Inhalt, der unten versteckt ist.
- **−** **Bewerbungsdetail desktop** ([07](design/07-application-detail-desktop-light.png)): schmale Karte (768 px) links, rechte Haelfte und untere Haelfte leer. Es fehlen die Dinge, die ein Detail wertvoll machen: **Status-Verlauf/Zeitachse, naechster Schritt, Link zur Stelle, Kontakt, Dokumente/CV-Verknuepfung**. Titel ("Applikationsentwickler:in EFZ") dominiert, Firma "Swisscom" ist grau und klein – bei Bewerbungen ist die **Firma** die primaere Identitaet (Logo/Initialen fehlen).
- **−** **Suche desktop**: Filterspalte listet **26 Kantone als gleichwertige Chips** (5 Zeilen) plus "Art der Stelle" – visuell schwerer als das Ergebnisfeld. Leerzustand ("So geht die Suche") ist ok, aber ohne Vorschlaege/Beliebte Berufe ([05](design/05-search-desktop-light.png)).
- **−** **Teacher-Uebersicht** ([24](design/24-teacher-dashboard-desktop-light.png)): 6 gleich gewichtete Kacheln mit abgeschnittenen Labels, im Leerzustand 6x "0" – darunter erst der eigentliche Leerzustand "Noch keine Klasse" (gut gemacht, mit CTA). Der Eindruck: viel Dashboard, nichts drin.

### 2.3 Typografie
- Sehr gut: enge, kraeftige Titel (`text-title`, `text-display`), Versal-Eyebrows mit Laufweite (`.text-eyebrow`: 11 px/650/.09em), Lesbarkeit der Fliesstexte (14-16 px).
- **Zu klein / zu blass:** Kennzahl-Untertitel ("Insgesamt", "Noch in Arbeit", "1 Zusage") sind **11-12 px** in `--muted` (#6e6e73) auf Verlaufshintergrund. Gemessen (Naeherung): **~4.47:1** -> knapp unter AA 4.5:1 fuer kleinen Text. Betrifft u. a. Eyebrows, KPI-Untertitel, Login-Fusszeile ("Deine Daten bleiben in deinem persoenlichen Konto." 12 px).
- Die Slogans wiederholen sich: "Bewerbungen einfach im Blick" (Login-Panel), "Deine Suche. Ganz einfach im Blick." (Dashboard), "Behalte deine Bewerbungen einfach im Blick." (Meta). Der Claim sagt, **was** (Bewerbungen), aber nicht **fuer wen** (Lehrstellensuchende in der Schweiz).

### 2.4 Farbe
- Blau->Violett-Verlauf als Markenfarbe, sehr konsistent in Buttons, Login-Panel, Karten-Schimmer. Fuer Schulen **seriös genug** (kein Neon, kein Cartoon-Gelb); der Verlauf wirkt eher "Fintech/SaaS" als "Schule" – das ist bei Jugendlichen eine Staerke, bei Behoerden/Schulleitungen neutral.
- Dark Mode: **wirklich gut** (Karten `#141b26`-artig, Chips mit getoenten Rahmen, Badges lesbar; [04 iPhone dunkel](design/04-dashboard-iphone-dark.png), [11 desktop dunkel](design/11-settings-desktop-dark.png)). Computed-Kontrast-Check im Dunkelmodus: **keine** Texte < 4.5:1 gefunden (Dashboard, Teacher). Warnung gilt nur fuer Hell.
- **Map im Dunkelmodus bleibt tageshell** (gruene Wiese, [09 iPhone dunkel](design/09-map-iphone-dark.png)); nur die Overlays werden dunkel. Es gibt einen Mond-Button fuer Nachtansicht. Kein Fehler, aber im Dark-Mode-Kontext ein Helligkeitsschock (sollte Systemeinstellung folgen oder vorschlagen).
- Rotes Badge auf "Freunde" (1) ist stark, korrekt als "neu".

### 2.5 Spielerisch vs. serioes fuer Schulen
- **Schueler-Seite:** Map mit isometrischen Haeusern, Figuren, Punkte (3500), Shop, Inseln; Freunde: "Hat Gespraeche im Kalender. Daumen druecken!", "Gemeinsam dranbleiben – jede Zusage zaehlt", Rang/Punkte. Das ist **Kahoot/Duolingo-Territorium** und bei 14-16-Jaehrigen ein echter Hook.
- **Lehrer-Seite:** nuechterne Tabelle, Fortschrittsbalken, "Wenigste Aktivitaet" als Default-Sortierung (sinnvoll: Hilfe dort, wo sie fehlt). Das ist die richtige Tonalitaet.
- **Spannungsfeld:** Der Lehrer sieht **"Anzahl Zusagen"** und **Rang-/Punkte-Logik der Schueler nicht** – gut. Aber im Freunde-Bereich werden Mitschuelern **"1 Gespraech, 3 Abgeschickt, 400 Map-Punkte"** angezeigt: sozialer Vergleichsdruck bei Absagen ist ein reales Risiko (siehe Wettbewerb/Forschung unten). Empfehlung: Standard "Aktivitaet teilen" = **aus** fuer Klassenkontext oder Ruecklauf-Neutralitaet (zeige "aktiv", nicht "Zusage vs. Absage").
- Empty States: **Schueler** sehr gut (3-Schritte-Karte mit Nummern und Primaer-CTA, [03](design/03-dashboard-empty-iphone-light.png)); **Lehrer** gut ("Noch keine Klasse" + CTA). Schwach: leere Suche (nur Text), leere Freunde (nicht geprueft).

### 2.6 Onboarding
- Rollenwahl "Wie nutzt du WendApply?" (Schueler:in / Lehrperson, nur einmal; [teacher/03](teacher/03-role-picker-desktop.png)): gut, klar, 2 Kacheln. Kleiner Mangel: Weiter-Button bleibt hellblau/transparent und wirkt deaktiviert, bis gewaehlt – ok; die Auswahl der "Lehrperson" faerbt die Kachel nur im Text blau, der Rahmen ist kaum staerker (schwacher Selected-State).
- Das **Klassen-Beitrittsfenster** mit expliziter Auflistung "Was Deine Lehrperson sieht / sieht nicht" ([20 iPhone dunkel](design/20-classes-student-iphone-dark.png)) ist **vorbildlich** fuer Vertrauen und DSG-Kommunikation (gruene Haken/rote Kreuze). Dieser Text ist der staerkste Verkaufsarguemnt gegenueber Schulen – er gehoert auch auf die Landingpage.
- Kein Tour/Hilfe nach dem ersten Schritt (siehe Heuristik 10).

## 3. Nielsen-Heuristiken (1 = schlecht, 5 = sehr gut)

| # | Heuristik | Score | Evidenz |
|---|---|:-:|---|
| 1 | Sichtbarkeit des Systemstatus | **4** | Farbige Status-Chips, Fristen-Badge "in 4 Tagen", Tab-Badge "1", Map-Labels mit Status ("Swisscom – In Vorbereitung"), Lehrer-Tabelle mit Statusbalken. Abzug: Detailseite ohne Verlauf; Stub zeigte keine Lade-/Speicherzustaende. |
| 2 | Uebereinstimmung System/Realwelt | **3** | Gute CH-Begriffe (Lehrstelle, EFZ, Zusage, Kantone). Aber "Map", "Shop", "Auswertung", "Gemerkt" sind jargonnah; **Schnupperlehre fehlt** als Typ (Suche: Lehrstelle/Praktikum/Job), obwohl sie in der Berufswahl DER Einstieg ist (vgl. Yousty/schnuppy unten). |
| 3 | Nutzerkontrolle & Freiheit | **4** | Freigabe jederzeit pausieren/beenden, "Klasse verlassen", Daten sichern/einlesen, Daten loeschen mit Hinweis "Tipp: vorher Sicherung herunterladen". Abzug: Undo nach Loeschen nicht erkennbar. |
| 4 | Konsistenz & Standards | **3** | Sehr konsistentes Komponentensystem, aber: natives Select im Detail, "Start"/"Uebersicht", "Deine"-Grossschreibung, "Schueler"-Formen gemischt, Grammatik "Freunde sieht". |
| 5 | Fehlervermeidung | **4** | Bestaetigung vor Loeschen (m-26/m-52 in student/), Konsens-Vorschau vor Klassenbeitritt, Passwort mit Sichtbarkeits-Toggle, Eingabefeld-Typen/Autocomplete korrekt (`inputMode="email"`). |
| 6 | Wiedererkennen statt Erinnern | **3** | Icon+Label in der Navigation. **Mobil: Map, Lebenslaeufe, Auswertung, Klassen, Einstellungen hinter "Mehr"** – die Map (Alleinstellungsmerkmal) ist nicht wiedererkennbar. Filter: 26 Kantone ohne Gruppierung. |
| 7 | Flexibilitaet & Effizienz | **3** | `/`-Shortcut in der Suche, gespeicherte Suchen, Sortierung/Filter in Lehrertabelle. Fehlt: Schnell-Hinzufuegen aus Suchergebnis in 1 Tap (nicht verifiziert), Tastaturkuerzel ausserhalb der Suche, Massenaktionen (Lehrer hat Bulk-Invite laut teacher/11). |
| 8 | Aesthetik & minimalistisches Design | **4** | Ruhig, viel Weissraum, sparsamer Farbeinsatz, kaum Deko. Abzug: Freunde-Seite (Datenschutz-Box zu lang), Teacher-6-KPI, Filter 26 Chips. |
| 9 | Fehler erkennen/beheben | **3** | Freundliche 404 ("Diese Seite gibt es nicht. Vielleicht hat sich der Link geaendert." + "Zur Startseite"), deutsche OAuth-Fehlermeldungen (Commit 4357bb8). Fehlerzustaende der Datenbank im Stub nicht getestet (siehe student/ m-05, m-03). Konservativ bewertet (wenig Evidenz). |
| 10 | Hilfe & Dokumentation | **2** | **Keine Hilfe/FAQ/Kontakt**, keine Landingpage, kein "Was ist neu". Einzige Hilfe: Leerzustand-Karten und "So geht die Suche". Fuer Schulen fehlen Datenschutz-/Elterninfo, Anleitung "In 3 Minuten eine Klasse starten". |
| | **Summe** | **33 / 50** | Solide "gut" im Produkt, Schwaeche im Drumherum (Onboarding fuer Dritte, Hilfe, Landing). |

## 4. Accessibility-Stichproben (WCAG 2.1 AA, Richtwerte)

Gemessen mit Playwright (Computed Styles, Elementgroessen), Dashboard + Teacher-Uebersicht + Login:

- **Touch-Ziele mobil:** Alle interaktiven Elemente >= 44x44 px (iPhone). **Desktop-Nav: 36 px hoch** (Tabs 79-133 x 36; Einstellungen/Abmelden 36x36) – ueber WCAG 2.2 AA (24 px), unter der eigenen Mobile-Regel 44; ok fuer Maus, aber bei Touch-Laptops/iPad (768-1024 px Breakpoint nicht getestet) pruefen.
- **Skip-Link** "Zum Inhalt springen" vorhanden (1x1 px bis Fokus – korrekt).
- **Kontrast hell:** `--muted` #6e6e73 auf Verlaufs-/Glas-Hintergrund ~4.47:1 (Naeherung) bei 11-12 px -> **knapp unter AA**; dunkel: keine Funde. Weisse Schrift im Verlauf (Primaerbutton, Login-Panel) rechnerisch nicht erfasst (Hintergrund = Gradient); `#0a72ee`/`#7a5af0` mit Weiss bei 15 px semibold liegt nach Augenmass bei ~4.5-5:1 (unsicher).
- **Farbe allein:** Status wird durch Text + Farbe vermittelt (gut). Lehrer-Statusbalken ([23](design/23-class-detail-teacher-desktop-light.png)) ist **nur farbig, ohne Legende/Zahlen** (blau/gruen/rot, Anna Meier) -> 8 % der Maenner (Rot-Gruen) koennen "gruen vs. rot" nicht trennen. Tooltip/Legende fehlt (im Screenshot nicht sichtbar).
- **Fokus/Screenreader:** `aria-pressed`/`aria-label` auf Passwort-Toggle, `role="status"` bei Laden, `aria-live`-Toast-Region vorhanden (aus HTML). Nicht mit echtem Screenreader getestet.
- **Zoom/Reflow:** 390 px ohne horizontalen Overflow in den geprueften Screens.

## 5. Wettbewerb/Analogien – was sie gut machen, wie WendApply sich unterscheidet

Quellen = Web-Suche vom 2026-11-06; Zahlen sind meist **Eigenangaben** der Anbieter.

1. **Yousty** – Lehrstellen- und Schnupperlehr-Portal. Nach Eigenangaben ~4.9 Mio. Besucher/Jahr und >60'000 ausgeschriebene Lehrstellen; Rubriken Schnupperlehren, Berufs-Finder, Berufswahlradar, Lehrberufsbarometer. Finanziert durch Lehrbetriebe. Laut Yousty-Umfrage bieten 72.7 % der befragten Firmen Schnupperlehren an; ueber Yousty werden ~250 Schnupperbewerbungen pro Woche verschickt (2-3 Bewerbungen pro Suchende). Quellen: [Yousty-Medienmitteilung PDF](https://cf-images.yousty.ch/pages%2F198%2Fdocuments%2F3ef45f5494f32a04fde4439a34afd670%2F09_Medienmitteilung_I_Schnupperlehren.pdf), [SRF: "Lehrstellen: sehen wollen, was man kriegt"](https://www.srf.ch/news/wirtschaft/lehrstellen-sehen-wollen-was-man-kriegt), [Yousty FAQ](https://www.yousty.ch/de-CH/help).
   - *Gut:* riesiges Angebot, Schnupperlehre als eigene Kategorie, Berufsfinder, Umfragedaten als Content-Marketing/PR.
   - *WendApply anders:* kein Marktplatz, sondern **Tracker/Begleiter** (Zeitleiste, Fristen, Status, Map). Yousty hilft beim **Finden**, WendApply beim **Dranbleiben**. Die Suche aggregiert Boersen, ist aber nur als **Zubringer** zu positionieren, nicht als Yousty-Konkurrenz. Luecke: kein "Schnuppern" als Status/Typ.
2. **schnuppy.ch** – von Sekundarschulen und Gewerbevereinen getragenes Schnupperlehr-Portal (Idee 2015 Sek Regensdorf, Rotary Dielsdorf als Initiant/Finanzierer, Online-Plattform seit 2017, laut Projektpapier >6'000 Bewerbungen). Zeigt "tatsaechlich verfuegbare" Schnuppergelegenheiten; "mit 2-3 Bewerbungen im Schnitt eine Zusage". Quellen: [Rotary-Projektdokument](https://glarus.rotary2000.ch/fr/file/01df9d7085a3342d7adbb94d79456131a35236e71610372484/download), [Kanton Zuerich: Tipps Schnupperlehre](https://www.zh.ch/de/news-uebersicht/mitteilungen/2025/bildung/biz-newsletter-februar-2025/die-wichtigsten-tipps-fuer-die-schnupperlehre.html) (nennt schnuppy, Berufswahl-Portal und Yousty als Uebersichten).
   - *Gut:* **Lokal, schulgetragen, vertrauenswuerdig** (Schule + Gewerbe + Verein), kein Werbemodell, Bezirks-Rollout.
   - *WendApply anders:* nationaler Ansatz, kein lokales Netzwerk. **Lektion:** Schulen vertrauen Initiativen, die von **Schulen und Gewerbe getragen** sind. Fuer den Schulen-Rollout: ein Pilot mit 1-2 Sekundarschulen + Co-Branding "Mit [Schulname]" wirkt staerker als anonyme Selbstregistrierung.
3. **Profolio Berufswahl (S&B Institut)** – bekanntes Berufswahl-Portfolio-Lehrmittel (Worlddidac Award 2008, heute digitales Lernmedium fuer Sek I; laut Uni-Basel-Evaluationsbericht mit Online-Fragebogen fuer Schueler:innen und Lehrpersonen, ausserdem verweist es auf Lehrplan 21). Quellen: [pressetext (2008)](https://www.pressetext.com/news/berufswahl-portfolio-gewinnt-den-worlddidac-award-2008.html), [Uni Basel Evaluationsbericht 2023](https://bildungswissenschaften.unibas.ch/fileadmin/user_upload/bildungswissenschaften/04_Forschung/Dokumente/Lindner__Bernheim__Duenki___Makarova_2023_Evaluationsbericht_Gendergerechtigkeit_im_Profolio_Berufswahl_20-032.pdf); Kantonale Berufswahlfahrplaene z. B. [OW](https://www.ow.ch/_doc/409696). (Funktionsumfang fuer Lehrpersonen nicht ueber diese Suche belegt – unsicher.)
   - *Gut:* **Anschluss an Lehrplan 21 / Berufswahlunterricht**, Unterrichtsmaterial fuer Lehrpersonen, Portfolio-Gedanke (Reflexion).
   - *WendApply anders:* kein Lehrmittel, kein Reflexions-Teil; dafuer Echtzeit-Fortschritt der echten Bewerbungen. **Luecke:** keine Verbindung zum Berufswahlunterricht (Termine/Meilensteine pro Schuljahr, z. B. "Bis Herbstferien 3 Schnupperlehren", ein Berufswahlfahrplan-Template fuer die Klasse). Genau da koennten Lehrpersonen WendApply als **Ergaenzung** zum Lehrmittel einsetzen.
4. **schulNetz / Klapp / Escola (Schulverwaltung & Elternkommunikation)** – schulNetz (Centerboard AG, Basel) laeuft nur, wenn die Schule die Verwaltungssoftware hat; Klapp ermoeglicht Mitteilungen/Dokumente/Termine an Klassen oder Eltern; Escola speichert Daten laut Datenschutzerklaerung in der Schweiz. Datenschutz bei Klapp war 2023 Thema im Landrat Baselland. Quellen: [schulNetz im App Store](https://apps.apple.com/de/app/schulnetz/id6450676202), [SRF: Wenn die Schule via App kommuniziert](https://www.srf.ch/news/schweiz/kommunikation-schule-eltern-wenn-die-schule-via-app-kommuniziert), [Escola Datenschutz](https://dateien.escola.ch/website/Escola_Datenschutz.pdf), [Baselland Landrat-Dokument](https://baselland.talus.ch/de/dokumente/geschaeft/ce6418025e5744908ff352032bf017a5-332).
   - *Gut:* **Schul-IT-integriert** (Schule bestellt, SSO/Vertrag), eindeutige Klassenzuordnung, CH-Datenhaltung als Verkaufsargument.
   - *WendApply anders:* keine Schulvertragsstruktur, Schueler registriert sich selbst. Das ist **Vorteil** (kein Beschaffungsprozess) und **Risiko** (Datenschutzbeauftragte fragen nach AVV/Hosting). **Lektion:** Eine Seite "Datenschutz fuer Schulen" (Hosting-Ort Supabase-Region, Datenminimierung, Freigabe-Schalter, Loeschung) ist Pflicht-Content; Klapp zeigt, dass Datenschutz in Schweizer Schulen reale politische Folgen hat.
5. **Kahoot / Duolingo (Engagement-Analogien)** – Streaks, XP, Bestenlisten, Quiz-Spiele. Die gefundene Evidenz ist **schwach und kleinteilig** (kleine Studien/Abschlussarbeiten, v. a. selbstberichtet): Streaks foerdern Regelmaessigkeit; es werden aber **Druck und Frust bei verlorenen Streaks/Rankings** berichtet. Quellen: [Studie Duolingo/EFL (Thesis)](https://pkm.uika-bogor.ac.id/index.php/best/article/view/2964), [Kahoot-Studie](https://www.hjuoz.uoz.edu.krd/index.php/hum/article/download/1361/1027?inline=1). Behauptungen wie "Duolingo-Streaks senken Churn von 47 % auf 28 %" stammen aus einem Blog ohne Quelle – nicht verwenden (unsicher).
   - *Gut:* sofortiges Feedback, kurze Loops, Gruppen-Dynamik ("Daumen druecken").
   - *WendApply anders/Risiko:* Bewerbungen haben **hohe Absagequote** – ein Ranking nach Zusagen oder Gespraechen ist demotivierend. Gamify **Handeln** (Bewerbung abgeschickt, Nachfassen, CV hochgeladen), nicht **Ergebnisse**.

**Positionierung in einem Satz:** WendApply ist weder Marktplatz (Yousty), noch Schulverwaltung (schulNetz/Klapp), noch Lehrmittel (Profolio) – es ist die **Begleit-App fuer den Bewerbungsprozess**, die Lehrpersonen **Einblick ohne Mehraufwand** gibt.

## 6. Konkrete Vorher/Nachher-Vorschlaege (Text/CSS-Ebene)

### 6.1 Landingpage statt Redirect `/` -> `/login` (P0)
- **Vorher:** `/` -> `/login`; Hero nur im Login-Panel: "Bewerbungen einfach im Blick."
- **Nachher (Text):**
  - H1: **"Die Lehrstellensuche – uebersichtlich, gemeinsam, ohne Stress."**
  - Sub: "WendApply begleitet Jugendliche von der ersten Idee bis zur Zusage. Lehrpersonen sehen, wer Unterstuetzung braucht – nur mit Einverstaendnis der Schueler:innen."
  - Zwei CTAs: **[Ich suche eine Lehrstelle]** (primaer) / **[Ich bin Lehrperson]** (sekundaer -> Seite "Fuer Schulen").
  - Sektion "Was Lehrpersonen sehen / nicht sehen" (Text aus Klassenbeitritt wiederverwenden) + "Daten in der Schweiz" (nur wenn zutreffend – Hosting pruefen).
  - Footer: Datenschutz, Impressum, Kontakt.

### 6.2 Teacher-KPI-Kacheln nicht abschneiden (P0, 1 Zeile)
- **Vorher:** `BEWERBUNG…`, `LEHRSTELLE…` (6 Kacheln bei 1280 px, Eyebrow + Icon ueberlaufen).
- **Nachher (CSS):** Raster `grid-template-columns: repeat(auto-fit, minmax(190px, 1fr))`, Label darf umbrechen (`white-space: normal; line-height: 1.25`), Icon in die rechte obere Ecke mit `flex-shrink:0`, oder Labels kuerzen: "Schueler:innen", "Bewerbungen", "Gespraeche", "Zusagen", "Lehrstelle gefunden", "Inaktiv". Zusaetzlich: **Leerzustand** -> bei 0 Klassen die 6 Kacheln ganz ausblenden und nur "Noch keine Klasse" zeigen.

### 6.3 Muted-Kontrast anheben (P1, 2 Zeilen)
- **Vorher:** `--muted: #6e6e73;` (hell) bei 11-12 px auf Glas ~4.47:1.
- **Nachher:** `--muted: #5f5f66;` (~5.9:1 auf Weiss, ~5.2:1 auf dem blaugrauen Verlauf) und `.text-eyebrow { font-size: .75rem; }` (12 px statt 11).

### 6.4 Gender- und Anrede-Konvention vereinheitlichen (P1)
- **Vorher:** "Schueler:in", "3 Schueler", "Schuelerinnen und Schueler", "Was Deine Lehrperson sieht", "Was Deine Freunde sieht".
- **Nachher:** durchgehend **"Schueler:innen"** (Rolle: "Schueler:in"); Zaehler "3 Schueler:innen"; Anrede klein: **"Was deine Lehrperson sieht"**, **"Was deine Freunde sehen"**. Als Lint-Regel/Textkonstanten in `lib/copy.ts` ablegen.

### 6.5 Freunde-Seite: Dringliches zuerst (P1)
- **Vorher (mobil):** Einladungscode -> Freund hinzufuegen -> Freigabe -> Datenschutz-Box (9 Zeilen) -> Anfragen -> Freunde.
- **Nachher:** **Anfragen (wenn >0)** -> Freunde -> Einladungscode (eingeklappt als "Freund:in einladen") -> Freigabe. Datenschutz-Box zu 2 Zeilen + `<details>` "Was sehen Freunde genau?".

### 6.6 Bewerbungsdetail aufwerten (P1)
- Header: **Firma gross** (Name + Initialen-Avatar in Markenfarbe), Position als Untertitel.
- Neue Karte "Naechster Schritt" (z. B. "Frist in 4 Tagen: Lebenslauf anhaengen" + Button) und **Zeitachse** (Gemerkt -> In Vorbereitung -> Abgeschickt ...), Link-Button "Stelle oeffnen" (sofern `url`).
- Statuswahl als **Segmented-Pills** statt `<select>`: `role="radiogroup"`, 44 px hoch, aktiver Status mit Chip-Farbe.

### 6.6b Mobile Navigation: Map sichtbar (P1)
- **Vorher:** Start | Suchen | Bewerbungen | Freunde | Mehr (Map in "Mehr").
- **Nachher:** Start | Suchen | **Map** | Bewerbungen | Mehr (Freunde -> Mehr, Badge "1" auf "Mehr" propagieren) – oder Map-Vorschau als Karte auf dem Dashboard ("Deine Insel – 8 Haeuser").

### 6.7 Lehrer-Statusbalken: Legende + Zahlen (P1)
- **Vorher:** blau/gruen/rot ohne Beschriftung ([23](design/23-class-detail-teacher-desktop-light.png)).
- **Nachher:** darunter/tooltip "2 Abgeschickt · 2 Gespraech/Zusage · 1 Absage", Segmente mit unterschiedlicher **Hoehe oder Muster** (`background-image: repeating-linear-gradient(45deg, …)` fuer Absage) zusaetzlich zur Farbe.

### 6.8 Mikrotexte
| Ort | Vorher | Nachher |
|---|---|---|
| Dashboard H1 | "Deine Suche. Ganz einfach im Blick." | "Hallo Lena – das ist dein naechster Schritt." + 1 konkrete Aufgabe ("Swisscom: Lebenslauf anhaengen, bis 10.11.") |
| Suche Leerzustand | "So geht die Suche" (3 Bullets) | Beliebte Berufe als Chips (Informatiker:in, Kauffrau/-mann, Fachperson Gesundheit) + "Schnuppern?"-Tab |
| Suche Typ-Tabs | Lehrstelle / Praktikum / Job | **Schnupperlehre** / Lehrstelle / Praktikum / Job |
| Teacher-Leerzustand | "Noch keine Klasse" | beibehalten + "In 3 Minuten: Klasse erstellen -> Code teilen -> Schueler:innen sehen" (Mini-Stepper) |
| Freigabe-Schalter | "Aktivitaet mit Freunden teilen" | + Hinweis "Zusagen und Absagen siehst nur du" (wenn zutreffend) – reduziert Vergleichsdruck |
| Klassencode-Feld | "Code oder Einladungslink" | "Klassencode von deiner Lehrperson (z. B. KLAS7Q2)" |
| Lehrer Tabellenzeile | "Teilt keine Daten" | "Teilt nichts – frag freundlich nach" (nur Lehrer-Tooltip, keine Aufforderung im UI, um Druck zu vermeiden: **besser**: "Freigabe aus (privat)") |

### 6.9 Spielerischer Ton: Regler statt Schalter (P2)
- Einstellung "Spielmodus" (Map/Punkte/Shop an/aus; **Standard fuer Schul-Konten: gedaempft** = nur Karte, keine Punkte/Rangliste). Lehrpersonen/Schulleitungen akzeptieren die App leichter, Jugendliche koennen es einschalten.

## 7. Priorisierte Liste

Aufwand: S = <= 0.5 Tag, M = 1-3 Tage, L = > 3 Tage.

### P0 (vor dem Schulen-Rollout)
| # | Massnahme | Aufwand |
|---|---|---|
| P0-1 | **Oeffentliche Landingpage** + Seite "Fuer Schulen" + Datenschutz fuer Schulen + Impressum/Kontakt (statt `/` -> `/login`) | M |
| P0-2 | **Teacher-Uebersicht:** KPI-Kacheln nicht abschneiden, Leerzustand ohne 6x "0" | S |
| P0-3 | **Freundes-Freigabe-Default pruefen** (kein Vergleichsdruck im Klassenkontext; "Zusagen/Absagen" nur fuer mich) – Produktentscheid + Copy | S |
| P0-4 | Hilfe/FAQ-Seite (min. "Erste Schritte Schueler", "Erste Schritte Lehrperson", Datenschutz) | M |

### P1
| # | Massnahme | Aufwand |
|---|---|---|
| P1-1 | `--muted` abdunkeln, Eyebrows 12 px (WCAG AA) | S |
| P1-2 | Gender-/Anrede-Konvention vereinheitlichen ("Schueler:innen", "deine", "Freunde sehen") | S |
| P1-3 | Freunde-Seite: Anfragen/Freunde vor Code und Datenschutz-Box | S |
| P1-4 | Mobile Tab-Bar: Map in die Hauptnavigation | S |
| P1-5 | Bewerbungsdetail: Firma gross, Zeitachse, naechster Schritt, Link, Segmented-Statusauswahl statt `<select>` | M |
| P1-6 | Lehrer-Statusbalken mit Legende/Zahlen/Muster (nicht nur Farbe) | S |
| P1-7 | **Schnupperlehre** als eigener Typ in Suche und Status; Berufswahl-Meilensteine/Fahrplan pro Klasse (Anschluss an Berufswahlunterricht) | M-L |
| P1-8 | Desktop-Nav-Targets auf 40-44 px (Padding) fuer Touch-Laptops | S |

### P2
| # | Massnahme | Aufwand |
|---|---|---|
| P2-1 | Spielmodus-Regler (Schul-Default gedaempft), Punkte/Streak nur fuer Aktionen statt Ergebnisse | M |
| P2-2 | Map im Dunkelmodus: automatische Nachtansicht oder Hinweis | S-M |
| P2-3 | Rollenwahl: staerkerer Selected-State (Rahmen + Haken) | S |
| P2-4 | Suche: Kantone gruppieren (Region/Karte) statt 26 Chips; Beliebte Berufe im Leerzustand | M |
| P2-5 | Co-Branding "Mit [Schulname]" / Pilot-Schulen-Seite (nach schnuppy-Muster) | M |
| P2-6 | Echte Screenreader-Tests (VoiceOver) und iPad-Breakpoints (768-1024) | M |

## 8. Aufraeumen
- Kein Test-Account angelegt (Stub-Backend), daher nichts in Supabase zu loeschen.
- Temporaere Kopie `/tmp/ux-teacher-copy` (Teacher-Branch ohne node_modules) war nur fuer die Screenshots; ihre `next dev`-Prozesse sind beendet.
- Skripte: [`design/shoot.mjs`](design/shoot.mjs) (Screenshots, reproduzierbar mit den beschriebenen Ports).
