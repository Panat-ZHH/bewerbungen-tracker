# WendApply – Copy-Deck öffentliche Website (Redesign)

Status: v1, 2026-11-17 · Autor: Copywriter-Agent · Basis: origin/main 841465f · verbindlich zusammen mit `_ux/GLOSSARY.md`
Für: ux-website-Agent (baut app/page.tsx, öffentliche Seiten, components/public/**, lib/seo/pages.ts, sitemap).

## 0. Regeln für die Umsetzung

- **Zahlen nie abtippen.** Jede Zahl unten steht mit ihrer Quelle in `{…}`. Im Code die Konstante verwenden:
  `{FAMILY.priceMonthText}` = CHF 7.90 · `{FAMILY.priceYearText}` = CHF 79 · Ersparnis Familienpaket = CHF 15.80 (`yearlySavingChf(PLANS.family)`) ·
  `{PLANS.solo}` Einzelabo = CHF 4.90 pro Monat / CHF 49 pro Jahr, Ersparnis CHF 9.80 · `{PACKAGES}` Starter CHF 990 (bis 100), Professional CHF 1'490 (bis 300),
  Enterprise CHF 3'990 (bis 800), Individuell = Offerte · `{PILOT.days}` = 30, `{PILOT.classes}` = «1 bis 2 Klassen», Pilot-Limit 60 Schüler:innen (`PLANS.pilot.studentLimit`) ·
  Testwoche = 7 Tage (docs/access/SPEC.md §1; im Code `FREE_NOTICE`/access) · `{perStudentMonth(pro)}` = 0.41.
  Für das Einzelabo gibt es in marketing.ts noch kein Pendant zu `FAMILY` → `SOLO` analog aus `PLANS.solo` ableiten (nur lesen, plans.ts nicht ändern).
- **Keine MWST-Angaben.** Kein «inkl./exkl. MWST».
- **Zwei Zustände der Online-Zahlung** (`onlinePaymentEnabled()` / `NEXT_PUBLIC_STRIPE_ENABLED`): wo Texte abweichen, steht **[Flag an]** / **[Flag aus]**.
- **Anrede:** Seiten für Schüler:innen und Eltern = du. /schulen, /pilot, Preise-Teil Schulen = Sie. Gemischte Seiten: Schul-Abschnitte neutral.
- **Kontakt-E-Mail** immer `{CONTACT_EMAIL}` (marketing.ts), nie hart codieren.
- **Testwoche gilt nicht für Lehrpersonen** (SPEC §1: Lehrpersonen/Schuladmins nur mit Schullizenz). Darum steht bei «Kostenlos testen» immer «für Schüler:innen und Eltern» in der Nähe, und Lehrpersonen-CTAs führen zu Demo/Pilot.
- **Primär-CTA** «Kostenlos testen» → `/login?mode=signup`. Achtung: `mode` wird heute von app/login/page.tsx NICHT gelesen (öffnet immer «Anmelden»). Login-Owner muss das ergänzen; bis dahin `/login`.
- **Sekundär-CTA** «Anmelden» → `/login`.
- `[NEU SCREENSHOT]` = Bild fehlt in public/landing/, Screenshot-Agent muss es aufnehmen (light + dark, ≤1280 px, Testkonto, keine echten Daten).
- SEO: `title` ohne Marke, ≤ 47 Zeichen (Template hängt « | WendApply» an → ≤ 60 total). Home ist absolut. `description` ≤ 155 Zeichen. Längen geprüft (Skript, siehe REPORT-copy.md).

---

## 1. Informationsarchitektur und URLs

### 1.1 Header-Navigation
Desktop (links nach rechts): Logo → `/` · **Funktionen** `/funktionen` · **Für Eltern** `/familien` · **Für Schulen** `/schulen` · **Preise** `/preise` · **FAQ** `/faq`
Rechts: Ghost-Button **Anmelden** `/login` · Primär-Button **Kostenlos testen** `/login?mode=signup`
Mobil: Logo + **Anmelden** (Textlink) + Menü-Button «Menü» (öffnet die 5 Punkte + Primär-Button «Kostenlos testen» unten im Menü).
Eingeloggte Personen: AuthRedirect bleibt wie heute.

### 1.2 Footer-Sitemap
- **WendApply** – Funktionen · Preise · Anleitung (`/anleitung`) · FAQ · Hilfe (`/hilfe`)
- **Für wen** – Schülerinnen und Schüler (`/funktionen`) · Eltern (`/familien`) · Schulen und Lehrpersonen (`/schulen`) · 30-Tage-Pilot (`/pilot`)
- **Über WendApply** – Über uns (`/ueber-uns`) · Kontakt (`/kontakt`) · Impressum (`/impressum`)
- **Datenschutz** – Datenschutz im Überblick · Datenschutzerklärung · Datenschutz für Jugendliche · Datenschutz für Schulen · Hosting · AVV-Vorlage · Löschkonzept
- Fusszeile: «WendApply ist ein Angebot von Wendico, Kleinandelfingen.» · «Keine Werbung. Keine Analyse-Tracker.» · Theme-Schalter

### 1.3 Alte → neue URLs (nichts darf brechen)

| Alte Route | Neu | Aktion | Bemerkung |
|---|---|---|---|
| `/` | `/` | neu gestalten | Home |
| `/preise` | `/preise` | neu gestalten | jetzt für alle Zielgruppen (Familie + Schule), Anker `#familie`, `#schulen` |
| `/schulen` | `/schulen` | neu gestalten | Nav-Label «Für Schulen», H1 nennt Lehrpersonen |
| `/familien` | `/familien` | neu gestalten | Nav-Label «Für Eltern». URL bleibt (SEO, Links in Mails/QR). KEIN `/fuer-eltern` anlegen; falls doch gewünscht: `/fuer-eltern` → 308 auf `/familien` |
| `/pilot` | `/pilot` | Texte anpassen | aus /schulen und /preise verlinkt, Footer |
| `/kontakt` | `/kontakt` | neu gestalten | |
| `/hilfe` | `/hilfe` | bleibt (Support für Nutzende) | oben Link «Häufige Fragen vor der Anmeldung: FAQ» |
| `/anleitung` | `/anleitung` | bleibt | aus Funktionen + Footer verlinkt |
| — | `/funktionen` | NEU | |
| — | `/faq` | NEU | FAQPage-JSON-LD hierhin; /hilfe behält eigenes JSON-LD nur für eigene Fragen (keine Duplikate) |
| — | `/ueber-uns` | NEU | |
| `/schullizenz` | unverändert | NICHT anfassen | App-Route (eingeloggt, Lizenz-Gate für Lehrpersonen), nicht in Sitemap |
| `/bewerbung-check` | unverändert | NICHT anfassen | App-Route (KI-Check im Dokumente-Bereich), nicht in Sitemap |
| `/impressum`, `/datenschutz`, `/datenschutz-uebersicht`, `/datenschutz-jugend`, `/datenschutz-schulen`, `/avv`, `/hosting`, `/loeschkonzept` | unverändert | nur Shell/Styling | Inhalte = Rechtstexte, nicht umschreiben |

Sitemap (`app/sitemap.ts`) und `lib/seo/pages.ts` (`PublicPath`) um `/funktionen`, `/faq`, `/ueber-uns` ergänzen.

---

## 2. Home `/`

**SEO** title (absolut): `Bewerbungs-Tracker für die Lehrstellensuche | WendApply` (55) – bleibt
description: `Lehrstellen finden, Bewerbungen und Fristen im Griff: WendApply für Schülerinnen, Schüler, Eltern und Sekundarschulen in der Schweiz. 7 Tage gratis.` (148)

### Hero
- Kicker (klein): `Für die Lehrstellensuche in der Schweiz`
- **H1:** `Von der ersten Bewerbung bis zur Zusage.` (Wort «Zusage» mit marker)
- Unterzeile: `Stellen finden, Bewerbungen und Fristen an einem Ort festhalten und dranbleiben. Allein, mit deinen Eltern oder mit deiner Klasse.`
- Primär: **Kostenlos testen** · Sekundär: **Anmelden**
- Kleingedruckt unter Buttons: `7 Tage gratis, ohne Zahlungsangaben. Hat deine Schule eine Schullizenz, ist WendApply für dich gratis.`
- Link darunter: `Lehrperson oder Schule? → Für Schulen` (`/schulen`)
- Sticker am Bild: `7 Tage gratis` · `Zusage!`
- Bild: `04-dashboard` · alt: `Startseite von WendApply: der Weg zur Lehrstelle mit gemerkten und abgeschickten Bewerbungen, Gesprächen und Zusagen und den nächsten Fristen`

### So funktioniert es (3 Schritte)
H2: `So funktioniert es`
1. **Stellen finden und merken** – `Such Lehrstellen und Schnupperlehren von Yousty, jobs.ch und jobup.ch auf einmal. Was dich interessiert, merkst du mit einem Tipp.`
2. **Bewerbungen im Griff** – `Jede Bewerbung hat ihren Status, ihre Frist und deine Notizen. WendApply erinnert dich, bevor eine Frist abläuft.`
3. **Dranbleiben** – `Jede Bewerbung baut ein Haus in deinem Dorf. Und wenn du willst, sehen deine Lehrperson oder deine Eltern deinen Fortschritt.`
Link: `Alle Funktionen ansehen →` `/funktionen`

### Für wen (4 Karten)
H2: `Für alle, die bei der Lehrstellensuche mithelfen`
| Karte | Titel | Text | Link |
|---|---|---|---|
| Schüler:innen | Für dich | `Alle Bewerbungen, Fristen und Dokumente an einem Ort. Du entscheidest, wer was sieht.` | `Funktionen →` /funktionen |
| Eltern | Für Eltern | `Sehen, wo dein Kind steht, ohne täglich nachzufragen. Dein Kind entscheidet, was es teilt.` | `Für Eltern →` /familien |
| Lehrpersonen | Für Lehrpersonen | `Den Fortschritt der Klasse auf einen Blick. Ohne zusätzliche Listen.` | `Für Lehrpersonen →` /schulen |
| Schulen | Für Schulen | `Eine Schullizenz für die ganze Schule. Für Schülerinnen und Schüler gratis. Testen im {PILOT.days}-Tage-Pilot.` | `Für Schulen →` /schulen |

### Screenshot-Abschnitt Schüler:innen
H2: `Finden, bewerben, dranbleiben`
Intro: `Du suchst eine Lehrstelle oder eine Schnupperlehre? WendApply hält deine Bewerbungen zusammen, auch wenn es viele werden.`
Liste: `Stellen aus mehreren Stellenbörsen in einer Suche` · `Lehrbetriebe auf der Karte finden` · `Status, Frist und Notizen für jede Bewerbung` · `Erinnerungen per E-Mail oder als Benachrichtigung`
Bild `05-search` – Bildunterschrift: `Eine Suche, mehrere Stellenbörsen: Yousty, jobs.ch und jobup.ch.` · alt: `Lehrstellensuche in WendApply: Suche nach «Informatiker» mit Filtern für Ort und Umkreis und Treffern aus mehreren Stellenbörsen`

### Screenshot-Abschnitt Lehrpersonen (neutral)
H2: `Den Fortschritt der Klasse sehen, ohne nachzufragen`
Intro: `Die Übersicht zeigt, wer wo steht. Gezählt wird nur, was Schülerinnen und Schüler ausdrücklich freigeben.`
Liste: `Klasse erstellen und per Link, Klassencode oder QR-Code einladen` · `Sehen, wer Unterstützung braucht, ohne zusätzliche Listen` · `Fristen und Mitteilungen an die ganze Klasse`
Bild `24-teacher-dashboard` – Bildunterschrift: `Die Klassenübersicht zeigt nur freigegebene Angaben.` · alt: `Übersicht für Lehrpersonen: Bewerbungen, Gespräche und Zusagen der Klasse, wer Unterstützung braucht, und die Klassenliste`
Buttons: **Für Schulen** (/schulen) · Ghost **Preise** (/preise#schulen)

### Vertrauen (nur belegte Fakten)
H2: `Deine Daten gehören dir`
| Titel | Text | Quelle |
|---|---|---|
| Du bestimmst, was geteilt wird | `Vor dem Klassenbeitritt siehst du genau, was deine Lehrperson sieht. Notizen und Dokumente bleiben immer privat.` | components/classes/privacy-panel.tsx, consent |
| Datenbank in der EU | `Deine Daten liegen in einem Rechenzentrum in Irland. Welche Dienstleister beteiligt sind, steht auf der Seite Hosting.` | docs/legal/hosting.md |
| Keine Werbung, kein Tracking | `WendApply zeigt keine Werbung, nutzt keine Analyse-Tracker und verkauft keine Daten.` | datenschutzerklaerung.md, datenschutz-uebersicht |
| Jederzeit löschen | `Du kannst deine Daten exportieren und dein Konto in den Einstellungen selbst löschen.` | settings, account-deletion |
Fusszeile: `Mehr dazu: Datenschutz im Überblick · Datenschutz einfach erklärt` (Links)
VERBOTEN in diesem Abschnitt: «zertifiziert», «100 % sicher», «Schweizer Server», «DSGVO-konform» (Texte sind laut datenschutz-uebersicht Entwürfe in rechtlicher Prüfung), Kundenzahlen, Logos von Schulen, Testimonials.

### FAQ-Teaser
H2: `Häufige Fragen`
3 Fragen aus §8 (gleicher Wortlaut): «Was kostet WendApply?», «Was sieht meine Lehrperson?», «Was passiert nach der Gratis-Testwoche?» + Link `Alle Fragen →` /faq

### Schluss-CTA (gelbes Band)
H2: `Bereit für die erste Bewerbung?`
Text: `Ein Konto ist in einer Minute erstellt. Die ersten 7 Tage sind gratis.`
Buttons: **Kostenlos testen** · Sekundär **Für Schulen**

---

## 3. Funktionen `/funktionen` (NEU, du)

**SEO** title: `Funktionen: Lehrstellen suchen und bewerben` (55 total) · description: `Lehrstellen suchen, Bewerbungen und Fristen verwalten, Dokumente ablegen, Motivationsschreiben prüfen und mit Klasse oder Eltern teilen.` (136)

H1: `Alles für deine Lehrstellensuche`
Intro: `WendApply läuft im Browser und lässt sich als App auf Handy und Computer installieren. Ohne App Store.`
Primär **Kostenlos testen** · Ghost **Anleitung ansehen** (/anleitung)

Abschnitte (je H2, Text, Liste, Bild):

1. **Stellen suchen** – `Eine Suche für mehrere Stellenbörsen: Yousty, jobs.ch und jobup.ch. Filtere nach Ort, Umkreis und Art der Stelle. Standardmässig siehst du Stellen in der Schweiz.`
   Liste: `Lehrstellen und Schnupperlehren` · `Lehrbetriebe auf der Karte` · `Mit einem Tipp merken`
   Bild: `05-search` · Bildunterschrift: `Treffer aus mehreren Stellenbörsen, nach Ort und Umkreis gefiltert.`
2. **Bewerbungen und Fristen** – `Von «Gemerkt» bis «Vertrag unterschrieben»: Jede Bewerbung zeigt ihren Status, die Frist, die Ansprechperson und deine Notizen.`
   Liste: `Schnupperlehre, Eignungstest und Gespräche festhalten` · `Erinnerungen auf der Startseite, per E-Mail oder als Benachrichtigung` · `Termine in deinen Kalender übernehmen`
   Bild: `04-dashboard` · Bildunterschrift: `Dein Weg zur Lehrstelle auf einen Blick.`
3. **Dokumente** – `Lebenslauf, Motivationsschreiben, Zeugnisse und Foto an einem Ort. Eine Checkliste zeigt, ob dein Bewerbungsdossier komplett ist.`
   Bild: [NEU SCREENSHOT] `/cvs` · Bildunterschrift: `Dokumente einmal hochladen, an jede Bewerbung anhängen.`
4. **Bewerbungs-Check** – `Der KI-Bewerbungs-Check gibt dir Punkte und konkrete Tipps für dein Motivationsschreiben, mit Vorher-Nachher-Sätzen. Dein Text geht dafür an einen KI-Dienst; die Datei wird nicht gespeichert.`
   Bild: [NEU SCREENSHOT] Ergebnis eines Checks mit Beispielbrief · Bildunterschrift: `Konkrete Tipps statt einer Note.`
5. **Dein Dorf** – `Jede Bewerbung wird ein Haus, das mit deinem Fortschritt wächst. Mit Punkten kaufst du im Laden Deko und schaltest neue Inseln frei. Punkte gibt es für sinnvolle Schritte, nie für Geld.`
   Bild: [NEU SCREENSHOT] `/map` · Bildunterschrift: `Dein Fortschritt als Dorf.`
6. **Freunde und Klasse** – `Gemeinsam geht es leichter. Du entscheidest, was Freunde, deine Lehrperson und deine Eltern sehen. Notizen und Dokumente bleiben immer privat.`
   Liste: `Freunde per Einladungscode` · `Klasse per Einladungslink, Klassencode oder QR-Code` · `Familie: Fortschritt mit Eltern teilen`
7. **Auswertung** – `Sieh, wie viele Bewerbungen unterwegs sind, wie viele Antworten und Gespräche du hast.`

Kasten «Für Lehrpersonen» (neutral): `Klassen erstellen, Fortschritt sehen, Fristen und Mitteilungen an alle senden.` → `Für Schulen und Lehrpersonen` (/schulen)
Schluss-CTA: H2 `Probier es aus` · Text `7 Tage gratis, ohne Zahlungsangaben.` · **Kostenlos testen**

---

## 4. Preise `/preise` (beide Zielgruppen)

**SEO** title: `Preise für Familien und Schulen` (43 total) · description: `7 Tage gratis testen. Einzelabo ab CHF 4.90 pro Monat, Familienpaket ab CHF 7.90 pro Monat. Schulen: Schullizenz ab CHF 990 pro Jahr, 30-Tage-Pilot gratis.` (155 = Limit; bei Preisänderung neu zählen)
(Alle Zahlen im description-String aus Konstanten bauen.)

H1: `Einfache Preise. 7 Tage gratis testen.`
Intro: `Für dich und deine Familie gibt es zwei Abos. Schulen kaufen eine Schullizenz, dann ist WendApply für Schülerinnen und Schüler gratis.`
Sprungmarken (Tabs/Chips): `Für dich und deine Familie` (#familie) · `Für Schulen` (#schulen)

### 4.1 #familie (du)
H2: `Für dich und deine Familie`
Karte 1 – **Gratis-Testwoche**
- Preis: `CHF 0` · Untertitel: `7 Tage`
- Liste: `Alle Funktionen` · `Ohne Zahlungsangaben` · `Endet automatisch, nichts wird belastet`
- Button: **Kostenlos testen**
Karte 2 – **Einzelabo** `{PLANS.solo.name}`
- Preis: `CHF 4.90 pro Monat` · darunter `oder CHF 49 pro Jahr (du sparst CHF 9.80)`
- Für: `1 Schülerkonto`
- Liste: `Alle Funktionen ohne Einschränkung` · `Monatlich oder jährlich` · `Kündbar auf Ende der Laufzeit`
- Button [Flag an]: **Abo wählen** → /login?next=/abo · [Flag aus]: **Kostenlos testen** + Hinweis `{FREE_NOTICE}`
Karte 3 – **Familienpaket** `{FAMILY.name}` (Sticker `Für Eltern`)
- Preis: `CHF 7.90 pro Monat` · darunter `oder CHF 79 pro Jahr (du sparst CHF 15.80)`
- Für: `1 Schülerkonto + 1 Elternkonto`
- Liste: `Alle Funktionen für dein Kind` · `Du siehst den Fortschritt, den dein Kind freigibt` · `Kündbar auf Ende der Laufzeit`
- Button [Flag an]: **Familienpaket wählen** → /login?next=/familie · [Flag aus]: **Auf die Warteliste** → /familien#warteliste
Hinweis-Zeile (status-info): `Hat deine Schule eine Schullizenz? Dann brauchst du kein Abo. Tritt einfach der Klasse deiner Lehrperson bei.`
Zahlung [Flag an]: `Bezahlt wird mit Karte. Die Quittung kommt per E-Mail.` [Flag aus]: `{FREE_NOTICE}`

### 4.2 #schulen (Sie)
H2: `Für Schulen: eine Lizenz für die ganze Schule`
Intro: `Die Schule bezahlt eine Schullizenz pro Jahr nach Anzahl Schülerinnen und Schüler. Lehrpersonen sind immer inbegriffen. Im Paket Professional sind das bei {pro.maxStudents} Schülerinnen und Schülern rund CHF {perStudentMonth(pro)} pro Person und Monat.`
Pakete aus `{PACKAGES}` (bestehende Karten; Texte):
- **Starter** – `Kleine Schulen` · `CHF 990 pro Jahr` · `bis 100 Schülerinnen und Schüler` · Liste `{core}` + `Support per E-Mail`
- **Professional** (Sticker `Empfohlen`) – `Für die meisten Sekundarschulen` · `CHF 1'490 pro Jahr` · `bis 300` · `{core}` + `Persönliche Einführung für das Kollegium`
- **Enterprise** – `Grosse Schulen mit erweiterter Administration` · `CHF 3'990 pro Jahr` · `bis 800` · `{core}` + `Erweiterte Administration für die Schule` + `Persönliche Einführung für das Kollegium`
- `{core}` (marketing.ts, Wörter angepasst): `Alle Funktionen für Schülerinnen und Schüler` · `Klassenübersicht und Begleitung für Lehrpersonen` · `Klassenziele, Klassendorf und Auswertungen` · `Datenschutz-Dokumente inkl. AVV-Vorlage`
Buttons pro Paket: [Flag an] **Online abschliessen** (für eingeloggte Schuladmins) + Link `Offerte anfragen` · [Flag aus] **Offerte anfragen** (`MAIL.offer(name)`)
Band «Individuell»: Titel `Mehrere Schulhäuser oder ein Schulverband?` · Text `Für Gemeinden, Schulträger und Verbände erstellen wir eine individuelle Offerte.` · Button **Offerte anfragen** (`MAIL.multi`)
Band «Pilot»: Titel `Zuerst testen: {PILOT.days}-Tage-Pilot` · Text `Gratis mit {PILOT.classes} und bis zu 60 Schülerinnen und Schülern. Danach entscheiden Sie in einem gemeinsamen Gespräch.` · Button **Pilot anfragen** (`MAIL.pilot`) · Link `So läuft der Pilot →` /pilot
Zahlung [Flag an]: `Online mit Kreditkarte oder auf Rechnung (zahlbar innert 30 Tagen). Eine Offerte mit Vertrag ist weiterhin möglich.` · [Flag aus]: `Sie erhalten eine Offerte und einen Vertrag, inklusive Datenschutz-Dokumenten und AVV-Vorlage.`

### 4.3 Preise-FAQ (6 Fragen; als FAQPage-JSON-LD nur hier ODER auf /faq, nicht doppelt → hier eigene, schulspezifische Fragen)
1. `Müssen Schülerinnen und Schüler etwas bezahlen?` – `Mit Schullizenz nicht: Dann bezahlt die Schule, die Gemeinde oder der Schulträger. Ohne Schullizenz gibt es nach der Gratis-Testwoche das Einzelabo oder das Familienpaket.`
2. `Wie wird gezählt?` – `Massgebend ist die Zahl der Schülerinnen und Schüler, die WendApply an Ihrer Schule nutzen. Lehrpersonen sind in allen Paketen inbegriffen.`
3. `Kann die Schule monatlich bezahlen?` – `Die Schullizenz läuft jährlich. Andere Zahlungsrhythmen klären wir in der Offerte.`
4. `Können wir zuerst testen?` – `Ja, mit dem {PILOT.days}-Tage-Pilot für {PILOT.classes}. Er ist gratis und endet automatisch.`
5. `Wie kündige ich ein Abo?` – `Unter «Abo verwalten» in deinem Konto. Das Abo läuft bis zum Ende der bezahlten Zeit und verlängert sich dann nicht mehr.`
6. `Kann man online bestellen?` – [Flag an] `Ja. Die Schuladministration wählt das Paket in WendApply im Bereich Schule und bezahlt mit Kreditkarte oder auf Rechnung (zahlbar innert 30 Tagen).` [Flag aus] `Noch nicht. Sie erhalten eine Offerte und einen Vertrag, wie bei Schulen üblich.`
(Frage 5 ist du, weil sie Familien betrifft – in der Liste als letzte Familienfrage vor den Schulfragen einordnen, oder auf /faq verschieben.)

Schluss-CTA (neutral): H2 `Noch Fragen zu den Preisen?` · Buttons **Kostenlos testen** · **Kontakt**

---

## 5. Für Eltern `/familien` (du)

**SEO** title: `Für Eltern: Lehrstellensuche begleiten` (50 total) · description: `Sieh, wo dein Kind bei der Lehrstellensuche steht, ohne täglich nachzufragen. Dein Kind entscheidet, was es teilt. Familienpaket ab CHF 7.90 pro Monat.` (151)

H1: `Begleiten statt kontrollieren`
Intro: `Die Lehrstellensuche ist für die ganze Familie eine intensive Zeit. Mit WendApply siehst du, wo dein Kind steht. Was du siehst, entscheidet dein Kind.`
Primär **Kostenlos testen** · Ghost **Preise ansehen** (/preise#familie)
Bild `familie-overview` · Bildunterschrift: `So sieht es ein Elternkonto: nur, was das Kind freigibt.` · alt: `Familienbereich in WendApply aus Sicht der Eltern: Bewerbungen des Kindes nach Status und sein Dorf, nur mit den Angaben, die das Kind teilt`

H2 `Was du davon hast`
- **Den Fortschritt kennen** – `Du siehst, wie viele Bewerbungen laufen und welchen Status sie haben, soweit dein Kind das teilt.`
- **Gezielt helfen** – `Fristen und nächste Schritte sind sichtbar. So weisst du, wann Hilfe beim Brief oder bei der Vorbereitung aufs Gespräch nützt.`
- **Motivation statt Druck** – `Dorf und Fortschritt machen kleine Erfolge sichtbar, auch nach einer Absage.`

H2 `So funktioniert es` (4 Schritte)
1. **Konto erstellen** – `Du oder dein Kind erstellt ein Konto. Wir fragen nur das Geburtsjahr, nicht das genaue Datum.`
2. **Kind einladen** – `Du erstellst einen Einladungscode. Er gilt 7 Tage und nur einmal. Dein Kind kann umgekehrt auch dich einladen.`
3. **Einwilligung** – `Ist dein Kind unter 16, gibst du die Einwilligung. Erst dann wird geteilt, was dein Kind freigibt.`
4. **Fortschritt sehen** – `Standardmässig siehst du Fortschritt und Dorf. Die Liste der Bewerbungen nur, wenn dein Kind sie freigibt.`

H2 `Was du siehst und was nicht`
- Sichtbar (Haken): `Anzahl und Status der Bewerbungen` · `Das Dorf` · `Die Bewerbungsliste, wenn dein Kind sie freigibt`
- Nie sichtbar (Kreuz): `Notizen` · `Dokumente wie Lebenslauf und Zeugnisse` · `Die Klasse und die Mitschülerinnen und Mitschüler` · `Andere Familien`
Satz darunter: `Dein Kind kann das Teilen jederzeit beenden. Dann siehst du nichts mehr, und alle Daten bleiben bei deinem Kind.`

H2 `Preis` – Familienpaket-Karte wie §4.1 Karte 3. Darunter: `Nutzt die Schule deines Kindes WendApply schon mit Schullizenz, ist WendApply für dein Kind gratis. Das Familienpaket brauchst du dann nur, wenn du den Fortschritt mitverfolgen willst.`
  → Faktencheck für Builder: Ob Eltern ohne Familienpaket ein Kind mit Schullizenz begleiten können, regelt lib/access (nicht ändern). Wenn unklar, Satz kürzen auf den ersten Teil.
[Flag aus] Wartelisten-Block: H2 `Auf die Warteliste` · Text `Wir starten mit wenigen Familien. Trag dich ein, dann melden wir uns, sobald ein Platz frei ist.` · Button **Eintragen**

H2 `Datenschutz für Minderjährige`
- `Nur nötige Daten: Name, E-Mail und Geburtsjahr.`
- `Einwilligung der Eltern für Kinder unter 16, bevor etwas geteilt wird.`
- `Keine Werbung, kein Verkauf von Daten. Für Eltern- und Kinderkonten gleich.`
- `Alle können ihre Daten exportieren, die Familie verlassen und ihr Konto löschen.`

FAQ (4, du): Fragen 2, 3, 9 und 11 aus §8 + `Kann ich später ein zweites Kind hinzufügen?` – `Das Familienpaket gilt für 1 Elternteil und 1 Kind. Weitere Kinder und ein zweites Elternteil sind geplant, aber noch nicht möglich.`
Schluss-CTA: H2 `Fragen zu WendApply für Familien?` · Text `Schreib uns. Wir erklären gern, was Eltern sehen und was nicht.` · **Kostenlos testen** · **Kontakt**

---

## 6. Für Schulen & Lehrpersonen `/schulen` (Sie)

**SEO** title: `Für Schulen: Berufswahl in der Sek begleiten` (56 total) · description: `Klassenübersicht, Fristen und Mitteilungen für Lehrpersonen, Schullizenz für die Schule, gratis für Jugendliche. Demo oder 30-Tage-Pilot anfragen.` (146)

Kicker: `Für Sekundarschulen und Lehrpersonen`
H1: `Den Bewerbungsprozess der Klasse sehen, ohne Listen zu führen.`
Intro: `WendApply hilft Sekundarschulen, den Bewerbungsprozess ihrer Schülerinnen und Schüler übersichtlich zu begleiten. Lehrpersonen sehen, wer Unterstützung braucht, und die Jugendlichen bleiben selbst am Steuer.`
Primär **Demo vereinbaren** (`MAIL.demo`) · Sekundär **Pilot anfragen** (/pilot) · Textlink `Preise für Schulen` (/preise#schulen)
Hinweis klein: `Für Lehrpersonen gibt es keine Gratis-Testwoche. Der Zugang läuft über die Schullizenz oder den {PILOT.days}-Tage-Pilot.`

H2 `Für Lehrpersonen`
- **Klassenübersicht** – `Bewerbungen, Schnupperlehren, Gespräche und Zusagen der Klasse auf einen Blick, soweit die Jugendlichen sie teilen.`
- **Wer braucht Unterstützung?** – `WendApply zeigt, wer länger nichts eingetragen hat oder bei wem eine Frist ansteht. So können Sie gezielt nachfragen.`
- **Fristen und Mitteilungen** – `Setzen Sie Fristen und schicken Sie Mitteilungen an die ganze Klasse.`
- **Klassenziele** – `Gemeinsame Ziele und ein Klassendorf. Vertrauliche Bewerbungsdetails sieht dabei niemand.`
- **Einladen in einer Minute** – `Per Einladungslink, Klassencode, QR-Code, E-Mail oder CSV-Liste. Auch mit Co-Lehrperson.`
- **Export** – `Klassendaten als CSV, zum Beispiel für Elterngespräche.`
Bild `24-teacher-dashboard` · Bildunterschrift: `Die Klassenübersicht: Fortschritt, offene Fristen und wer Aufmerksamkeit braucht.`

H2 `Für die Schuladministration`
- `Eine Schullizenz für alle Klassen der Schule, Lehrpersonen inbegriffen.`
- `Lehrpersonen hinzufügen und entfernen, Belegung der Lizenz im Blick.`
- [Flag an] `Online bezahlen mit Kreditkarte oder auf Rechnung.` [Flag aus] `Offerte und Vertrag, wie bei Schulen üblich.`

H2 `Für Schülerinnen und Schüler`
Intro: `WendApply macht Fortschritt sichtbar und belohnt Eigeninitiative. Gezählt werden sinnvolle Schritte, nicht möglichst viele Bewerbungen.`
- `Stellen, Bewerbungen, Status, Fristen und Dokumente an einem Ort`
- `Jeder Schritt von der Schnupperlehre bis zum Lehrvertrag wird sichtbar`
- `Ein persönliches Dorf, das mit dem Fortschritt wächst`
Bild `04-dashboard` · Bildunterschrift: `Die Startseite der Schülerinnen und Schüler.`

H2 `Datenschutz von Anfang an`
Intro: `WendApply arbeitet mit Daten von Minderjährigen. Datenschutz ist deshalb Teil des Produkts.`
- `Lehrpersonen sehen nur, was Schülerinnen und Schüler für die Klasse freigeben. Notizen, Lebenslauf und Dokumente bleiben immer privat.`
- `Mitschülerinnen und Mitschüler sehen keine Bewerbungsdetails.`
- `Rollen für Schülerinnen und Schüler, Lehrpersonen und Schuladministration. Die Zugriffsregeln gelten direkt in der Datenbank.`
- `Datenbank in der EU (Irland), verschlüsselte Übertragung (HTTPS), Löschkonzept und AVV-Vorlage.`
- `Keine Werbung, keine Analyse-Tracker.`
Links: `Datenschutz für Schulen` · `AVV-Vorlage` · `Löschkonzept` · `Hosting`
Hinweis (klein, ehrlich – bestehende Aussage): `Die Datenschutz-Dokumente sind Entwürfe und werden rechtlich geprüft. Zertifizierungen haben wir keine.`

H2 `So kommt WendApply an Ihre Schule` (3 Schritte)
1. **Demo** – `Wir zeigen WendApply live aus Sicht der Schülerinnen und Schüler und der Lehrpersonen, online oder vor Ort.`
2. **Pilot** – `{PILOT.days} Tage gratis mit {PILOT.classes}, begleitet von uns.`
3. **Schullizenz** – `Im Abschlussgespräch entscheiden Sie über die Schullizenz.`

Schluss-CTA: H2 `Lernen Sie WendApply live kennen.` · Text `In der Demo sehen Sie beide Sichten. Danach klären wir, ob ein Pilot für Ihre Schule passt.` · **Demo vereinbaren** · **Pilot anfragen**

### 6.1 `/pilot` (Sie) – nur Anpassungen
SEO title: `30-Tage-Pilot für Sekundarschulen` (45 total) – bleibt (`{PILOT.days}`) · description bleibt (148).
Ersetzen: «Datenschutz-Unterlagen für die Schulleitung» → `Datenschutz-Dokumente für die Schulleitung, inklusive AVV-Vorlage`. Ergänzen in «Was Ihre Schule bekommt»: `Gratis, ohne automatische Verlängerung`. Rest unverändert (Texte sind bereits faktentreu).

---

## 7. Über uns `/ueber-uns` (NEU, du/neutral)

**SEO** title: `Über uns: wer hinter WendApply steht` (48 total) · description: `WendApply ist ein Angebot von Wendico aus Kleinandelfingen. Warum wir einen Bewerbungs-Tracker für die Lehrstellensuche bauen und wie wir arbeiten.` (147)

H1: `Wer hinter WendApply steht`
Absatz 1: `WendApply ist ein Angebot von Wendico, einer Kollektivgesellschaft aus Kleinandelfingen im Kanton Zürich. Wir entwickeln WendApply seit 2026.`
Absatz 2 (Warum): `Bei der Lehrstellensuche schreiben Jugendliche oft Dutzende Bewerbungen, gehen schnuppern und warten auf Antworten. Den Überblick behalten sie meist in Heften, Listen und E-Mails. WendApply bringt das an einen Ort und macht Fortschritt sichtbar, für die Jugendlichen selbst und, wenn sie es wollen, für Eltern und Lehrpersonen.`
  → Hinweis Builder: «Dutzende» ist eine allgemeine Beschreibung, keine Statistik. Falls Panat eine belegte Zahl hat, ersetzen; sonst so lassen.
H2 `Woran wir uns halten`
- `Die Jugendlichen entscheiden. Wer was sieht, legen sie selbst fest.`
- `Sinnvolle Schritte zählen, nicht die Menge. Punkte gibt es für Fortschritt, nie für Geld.`
- `Datensparsam. Keine Werbung, keine Analyse-Tracker, kein Verkauf von Daten.`
- `Schweizer Lehrstellensuche: Lehrstelle, Schnupperlehre, Multicheck. Ortsdaten von swisstopo, Stellen von Yousty, jobs.ch und jobup.ch.`
H2 `Team` → **NUR mit Freigabe von Panat**. Im Impressum stehen «Panat Ruangsri, Tim Biedermann» mit dem Vermerk «Namen und Vertretungsform bestätigen». Bis zur Bestätigung KEINEN Team-Abschnitt bauen. Platzhalter im Code als Kommentar, nicht sichtbar.
H2 `Kontakt` – `Fragen, Feedback oder Ideen? Schreib uns an {CONTACT_EMAIL}.` · Link Impressum
CTA: **Kostenlos testen**

---

## 8. FAQ `/faq` (NEU, du; Schulfragen neutral) – 13 Fragen

**SEO** title: `Häufige Fragen zu WendApply` (39 total) · description: `Antworten zu Kosten, Gratis-Testwoche, Kündigung, Datenschutz, Klasse und Eltern: alles, was du vor dem Start mit WendApply wissen willst.` (138)

H1: `Häufige Fragen`
Intro: `Deine Frage ist nicht dabei? Schau in der Hilfe nach oder schreib uns.` (Links /hilfe, /kontakt)
Gruppen (H2) und Fragen; Antworten als reiner Text (werden ins FAQPage-JSON-LD übernommen):

**Kosten und Abo**
1. `Was kostet WendApply?` – `Die ersten 7 Tage sind gratis. Danach gibt es das Einzelabo für CHF 4.90 pro Monat oder CHF 49 pro Jahr und das Familienpaket für CHF 7.90 pro Monat oder CHF 79 pro Jahr. Hat deine Schule eine Schullizenz, bezahlt die Schule und für dich ist WendApply gratis.`
2. `Wie funktioniert die Gratis-Testwoche?` – `Jedes neue Konto für Schülerinnen, Schüler und Eltern kann WendApply 7 Tage mit allen Funktionen testen. Du gibst dafür keine Zahlungsangaben an. Nach 7 Tagen endet die Testwoche automatisch, es wird nichts belastet.`
3. `Was passiert nach der Gratis-Testwoche?` – `Ohne Abo ist dein Zugang pausiert. Du kannst deine Daten weiter ansehen, exportieren und löschen. Mit einem Abo geht es sofort weiter, alles ist noch da.`
4. `Wie kündige ich mein Abo?` – `In deinem Konto unter «Abo verwalten». Das Abo läuft bis zum Ende der bezahlten Zeit und verlängert sich danach nicht mehr.`
5. `Muss ich bezahlen, wenn meine Schule WendApply nutzt?` – `Nein. Hat deine Schule eine Schullizenz und bist du in der Klasse deiner Lehrperson, bezahlt die Schule.`

**Klasse und Eltern**
6. `Wie trete ich der Klasse meiner Lehrperson bei?` – `Deine Lehrperson gibt dir einen Einladungslink, einen Klassencode oder einen QR-Code. Öffne den Link oder gib den Code unter «Klassen» ein. Vor dem Beitritt siehst du genau, was deine Lehrperson sehen wird.`
7. `Was sieht meine Lehrperson?` – `Nur, was du beim Beitritt freigibst, zum Beispiel Anzahl und Status deiner Bewerbungen. Notizen, Lebenslauf und Dokumente sieht sie nie. Du kannst die Freigabe jederzeit ändern.`
8. `Was sehen meine Eltern?` – `Nur, was du freigibst: standardmässig deinen Fortschritt und dein Dorf, die Bewerbungsliste nur, wenn du willst. Bist du unter 16, braucht das Teilen die Einwilligung deiner Eltern. Du kannst das Teilen jederzeit beenden.`

**Daten und Sicherheit**
9. `Wo liegen meine Daten?` – `Datenbank und Dateien liegen in einem Rechenzentrum in Irland (EU). Die Webseite wird über einen Anbieter aus den USA ausgeliefert. Alle Dienstleister stehen auf der Seite Hosting.`
10. `Kann ich mein Konto löschen und meine Daten mitnehmen?` – `Ja. In den Einstellungen findest du «Daten exportieren» und «Konto löschen». Beim Löschen werden dein Konto und alle Daten entfernt.`
11. `Was passiert mit meinem Brief beim Bewerbungs-Check?` – `Der Text wird für den Check an einen KI-Dienst geschickt. Die Datei wird nicht gespeichert, nur das Ergebnis in deinem Konto. Frühere Checks kannst du jederzeit löschen.`

**App und Schulen**
12. `Brauche ich eine App aus dem App Store?` – `Nein. WendApply läuft im Browser. Du kannst es aber direkt aus dem Browser als App auf Handy, Tablet oder Computer installieren.`
13. `Wie kann eine Schule WendApply testen?` – `Mit dem 30-Tage-Pilot für 1 bis 2 Klassen. Er ist gratis. Lehrpersonen haben ohne Schullizenz oder Pilot keinen Zugang, darum gibt es für sie keine Gratis-Testwoche.` (Link /pilot)

Schluss-CTA: **Kostenlos testen** · **Kontakt**

---

## 9. Kontakt `/kontakt` (neutral, Schulbox Sie)

**SEO** title: `Kontakt, Demo und Pilot` (35 total) · description: `Fragen zu WendApply, Feedback, eine Live-Demo oder ein Pilot für die Sekundarschule: So erreichst du das WendApply-Team per E-Mail.` (131)

H1: `Kontakt`
Intro: `Eine E-Mail genügt. Wir antworten in der Regel innert weniger Werktage.`
Box 1 – **E-Mail** – `{CONTACT_EMAIL}` · Button **E-Mail schreiben**
Box 2 – **Für Schulen** (Sie) – `Möchten Sie WendApply kennenlernen? Wir zeigen es Ihnen live und besprechen einen Pilot.` · Buttons **Demo vereinbaren** (`MAIL.demo`) · **Pilot anfragen** (`MAIL.pilot`)
Box 3 – **Hilfe zur App** (du) – `Probleme bei der Anmeldung oder mit der App? In der Hilfe findest du die häufigsten Lösungen.` · Button **Zur Hilfe** (/hilfe)
Box 4 – **Datenschutz** – `Fragen zum Datenschutz oder zur Löschung von Daten: siehe Datenschutzerklärung.` (Link)
Fusszeile: `Anbieterin: Wendico, Kleinandelfingen. Siehe Impressum.`

---

## 10. Hilfe `/hilfe` und Anleitung `/anleitung` – nur Korrekturen
- /hilfe: oben Hinweis `Fragen vor der Anmeldung? → FAQ`. Gruppe «Probleme beim Login» → `Probleme bei der Anmeldung`. «Betrieb» → «Firma». Antwort «Kann die Schule monatlich bezahlen?» → Text wie §4.3 Frage 3. Familienantwort «Ja, bald» an Flag koppeln. Doppelte Fragen mit /faq aus dem JSON-LD von /hilfe entfernen (nur /faq hat sie im JSON-LD).
- /anleitung (components/guide/content.tsx): Lehrpersonen-Teil neutral statt Sie; «Mitteilung» für Push → «Benachrichtigung»; «Stand der Klasse» → «Fortschritt der Klasse»; FAQ «Daten sichern» → «Daten exportieren»; «Unterlagen» → «Dokumente».
- SEO /hilfe title: `Hilfe zur App` (25 total) · description: `Erste Schritte, Klasse beitreten, Passwort vergessen, Bestätigungs-E-Mail fehlt: Antworten und Lösungen für die Arbeit mit WendApply.` (133)
- SEO /anleitung bleibt.

---

## 11. SEO-Übersicht (alle öffentlichen Seiten)

| Route | title (ohne « | WendApply») | Zeichen total | description | Zeichen |
|---|---|---|---|---|---|
| / | Bewerbungs-Tracker für die Lehrstellensuche \| WendApply (absolut) | 55 | siehe §2 | 148 |
| /funktionen | Funktionen: Lehrstellen suchen und bewerben | 55 | siehe §3 | 136 |
| /preise | Preise für Familien und Schulen | 43 | siehe §4 | 155 |
| /familien | Für Eltern: Lehrstellensuche begleiten | 50 | siehe §5 | 151 |
| /schulen | Für Schulen: Berufswahl in der Sek begleiten | 56 | siehe §6 | 146 |
| /pilot | 30-Tage-Pilot für Sekundarschulen | 45 | bleibt | – |
| /ueber-uns | Über uns: wer hinter WendApply steht | 48 | siehe §7 | 147 |
| /faq | Häufige Fragen zu WendApply | 39 | siehe §8 | 138 |
| /kontakt | Kontakt, Demo und Pilot | 35 | siehe §9 | 131 |
| /hilfe | Hilfe zur App | 25 | siehe §10 | 133 |
| /anleitung | bleibt | – | bleibt | – |
| Rechtsseiten | bleiben | – | bleiben | – |

---

## 12. Bildunterschriften / Screenshots (Sammlung)

| Asset | Seite(n) | Bildunterschrift | Status |
|---|---|---|---|
| 04-dashboard | Home, Funktionen, Schulen | Dein Weg zur Lehrstelle auf einen Blick. | vorhanden |
| 05-search | Home, Funktionen | Eine Suche, mehrere Stellenbörsen: Yousty, jobs.ch und jobup.ch. | vorhanden |
| 24-teacher-dashboard | Home, Schulen | Die Klassenübersicht zeigt nur freigegebene Angaben. | vorhanden |
| familie-overview | Für Eltern | So sieht es ein Elternkonto: nur, was das Kind freigibt. | vorhanden |
| dokumente (/cvs) | Funktionen | Dokumente einmal hochladen, an jede Bewerbung anhängen. | [NEU SCREENSHOT] |
| ki-check (Ergebnis) | Funktionen | Konkrete Tipps statt einer Note. | [NEU SCREENSHOT] |
| dorf (/map) | Funktionen | Dein Fortschritt als Dorf. | [NEU SCREENSHOT] |
| klasse-beitreten (Freigaben-Panel) | Funktionen, Schulen (optional) | Vor dem Beitritt siehst du, was deine Lehrperson sieht. | [NEU SCREENSHOT] optional |
Alle Screenshots: neue Begriffe aus GLOSSARY sichtbar (nach den Persona-Fixes aufnehmen), keine echten Namen.
