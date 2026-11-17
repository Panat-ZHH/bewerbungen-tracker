# WendApply – Glossar, Anrede und Tonalität (VERBINDLICH)

Status: v1, 2026-11-17 · Autor: Copywriter-Agent · Basis: origin/main 841465f (= Branch ux-copy)
Gilt für: alle UI-Texte, öffentliche Website, E-Mails, Hilfe/Anleitung, Fehlermeldungen. Admin (/admin) nur «sollte».
Ausnahmen, die NICHT angefasst werden: DB-/Code-Werte (`offer`, `trial`, `school_admin` …), Variablennamen, Tests, die
Wörter nur als Suchbegriffe enthalten (z. B. Nav-`keys`), der KI-Prompt in `supabase/functions/ai-review/prompt.ts`
(ausser er widerspricht einer Regel unten), Rechtstexte unter `docs/legal/` (nur Juristin/Jurist).

So benutzt ihr dieses Dokument: Abschnitt 1 = Begriffe (links richtig, rechts verboten → ersetzen). Abschnitt 2 = Du/Sie.
Abschnitt 3 = Tonregeln. Abschnitt 4 = Standard-Microcopy zum Kopieren. Abschnitt 5 = gefundene Stellen (Datei:Zeile) als
Arbeitsliste. Wenn ein Builder eine Regel nicht anwenden kann (z. B. Datei gehört einem anderen Agenten), Stelle in seinem
Report notieren, nicht stillschweigend abweichen.

---

## 1. Begriffe – EIN Wort pro Konzept

Format: **Standard** (erlaubte Kurzform) — verboten/ersetzen → Hinweis.

### 1.1 Personen und Rollen

| Konzept | Standard | Kurzform (nur wo Platz fehlt) | Nicht verwenden → ersetzen durch Standard |
|---|---|---|---|
| Jugendliche/r, die/der eine Lehrstelle sucht | **Schülerinnen und Schüler** (Fliesstext, Plural) | **Schüler:in / Schüler:innen** (Rollenlabel, Badge, Tabellenkopf, Zählwort) | «Schüler/in», «Lernende/Lernende:r» (heisst in der Schweiz *Lehrling in Ausbildung* – falsch!), «Schüler» allein als Gruppenwort (z. B. «Schüler bezahlen nichts»), «Schüleraccount» |
| Anrede in der App | **du** (siehe 2) | – | – |
| «Jugendliche» | nur in Datenschutz-/Eltern-/Rechtskontext, wo das Alter zählt («Daten von Jugendlichen») | – | als Rollenname («Elternteil oder Jugendliche:r erstellt ein Konto» → «Elternteil oder Schüler:in erstellt ein Konto») |
| Lehrperson | **Lehrperson / Lehrpersonen** | – | «Lehrer», «Lehrerin», «Lehrkraft», «Lehrer:in» |
| Zweite Lehrperson einer Klasse | **Co-Lehrperson** | – | «Mitlehrer», «zweite Lehrperson» als Rollenname |
| Person, die in WendApply die Schule verwaltet (Lizenz, Lehrpersonen) | **Schuladmin** (Person), Bereich heisst **Schule** (Nav) bzw. **Schuladministration** (Fliesstext) | – | «Schul-Admin», «Schuladministrator», «Admin» allein |
| Entscheidungsträger an der Schule (real, ausserhalb der App) | **Schulleitung** – NUR auf Marketing-/Pilotseiten und in Offerten | – | in der App für die Rolle (→ «Schuladmin») |
| Elternteil mit Konto | **Elternteil** (Rolle), Konto: **Elternkonto** | **Eltern** (Plural, Fliesstext) | «Elternaccount», «Erziehungsberechtigte» (nur Rechtstext), «Mami/Papi» |
| Kind im Familienkonto (aus Elternsicht) | **dein Kind** | – | «Ihr Kind» (Eltern werden geduzt), «Jugendliche:r» |
| Freundinnen und Freunde in der App | **Freunde** (Nav, Überschrift) · Fliesstext Einzahl: **Freundin oder Freund** | – | «Freund:innen», «Kontakte», «Buddies» |
| Klassenkamerad/innen | **Mitschülerinnen und Mitschüler** | Mitschüler:innen | «Klassenkameraden» |
| Plattform-Team | **wir** / **das WendApply-Team** | – | «der Support», «die Admins» |

### 1.2 Bewerben und Status

Die Statuslabels in `lib/status.ts` (`statusLabels`) SIND der Standard. Nicht umformulieren, nur überall gleich verwenden:
Gemerkt · In Vorbereitung · Abgeschickt · Schnupperlehre geplant · Schnupperlehre gemacht · Eignungstest / Multicheck ·
Gespräch · Weiteres Gespräch · Zusage · Vertrag unterschrieben · Absage erhalten · Zurückgezogen

| Konzept | Standard | Kurzform | Nicht verwenden → ersetzen |
|---|---|---|---|
| Eintrag in der Liste (auch nur gemerkt) | **Bewerbung** | – | «Anfrage», «Eintrag», «Job» (für den Eintrag) |
| Ausgeschriebene Stelle aus der Suche | **Stelle** (Lehrstelle / Schnupperlehre) | – | «Job», «Inserat», «Angebot» |
| Lehrstelle | **Lehrstelle** | – | «Ausbildungsplatz», «Lehre» als Stellenwort |
| Arbeitgeber | **Firma** (Feld, Listen, Freigaben) | – | «Betrieb», «Unternehmen», «Arbeitgeber» in der App. **Ausnahme:** «Lehrbetrieb» ist auf Marketing-/SEO-Seiten erlaubt, wenn ausdrücklich die ausbildende Firma gemeint ist |
| Aktueller Schritt einer Bewerbung | **Status** | – | «Stand» (für den Status; «Was ist der Stand?» → «Status»). «Stand» NUR für Datumsangaben: «Stand: 17.11.2026» |
| Fortschritt einer Person/Klasse über alle Bewerbungen | **Fortschritt** | – | «Stand» («Den Stand der Klasse sehen» → «Den Fortschritt der Klasse sehen») |
| Status `saved` | **Gemerkt**, Aktion: **Merken** | – | «Merkliste», «Favorit», «Gespeichert» |
| Positive Antwort | **Zusage** | – | «Angebot», «Offer» |
| Schnuppern | **Schnupperlehre** | – | «Schnuppertag(e)», «Schnupperwoche» als Label (Zählwort: «Schnupperlehren») |
| Vorstellungsgespräch | **Gespräch** (UI/Status) | **Vorstellungsgespräch** nur in Erklärtexten/Marketing beim ersten Vorkommen | «Bewerbungsgespräch», «Interview» |
| Abgabe-/Bewerbungsfrist | **Frist**; Feld: «Bewerben bis» | – | «Deadline», «Termin» (für Frist) |
| Hinweis per Push/E-Mail | **Erinnerung** (Funktion), technische Meldung aufs Gerät: **Benachrichtigung** | – | «Mitteilung» für Push («Mitteilung auf diesem Gerät» → «Benachrichtigung auf diesem Gerät») |
| Nachricht der Lehrperson an die Klasse | **Mitteilung** | – | «Nachricht», «Ankündigung», «Info» |

### 1.3 Dokumente

| Konzept | Standard | Kurzform | Nicht verwenden → ersetzen |
|---|---|---|---|
| Bereich + alle Dateien (Lebenslauf, Motivationsschreiben, Zeugnisse, Foto) | **Dokumente** (Nav «Dokumente», Seite «Meine Dokumente») | – | «Unterlagen», «CVs», «Dateien» als Bereichsname |
| Einzelne Datei | **Dokument** (Art nennen, wenn bekannt: «Lebenslauf») | – | «Unterlage», «Anhang» als Substantiv in der UI |
| Vollständiges Set für Bewerbungen | **Bewerbungsdossier** | **Dossier** (nur in Checkliste/Status: «Dossier: 3 von 5 Dokumenten dabei») | «Unterlagen» («3 von 5 Unterlagen dabei» → «3 von 5 Dokumenten dabei») |
| Abschnitt in der Bewerbungs-Detailseite | **Dokumente** | – | «Unterlagen» (app/applications/[id]/page.tsx:174) |
| Begleitbrief | **Motivationsschreiben** | **Brief** (nur Fliesstext nach erster Nennung) | «Anschreiben», «Bewerbungsbrief», «Cover Letter» |
| KI-Prüfung | **Bewerbungs-Check** (Funktion), Langform beim ersten Vorkommen: **KI-Bewerbungs-Check** | **KI-Check** | «AI Review», «Brief-Check» |
| Datenschutzpakete für Schulen | **Datenschutz-Dokumente** | – | «Datenschutz-Unterlagen» |

### 1.4 Spiel / Dorf

| Konzept | Standard | Kurzform | Nicht verwenden |
|---|---|---|---|
| Die spielerische Welt (Route /map) | **Dorf** («Dein Dorf», «Klassendorf») | – | «Karte», «Map», «Welt», «Insel-Map» |
| Freischaltbare Teilflächen | **Insel** (Ostinsel, Südinsel, Gipfelinsel) | – | «Level», «Gebiet» |
| Gebäude pro Bewerbung | **Haus** | – | «Gebäude» |
| Währung im Spiel | **Punkte** | – | «Coins», «Münzen», «Credits» |
| Laden im Dorf | **Laden** | – | «Shop» (im UI-Text; Code darf «shop» heissen) |
| Geografische Karte in der Suche | **Karte** (NUR dafür) | – | «Map» |

### 1.5 Konto, Zugang, Preise

| Konzept | Standard | Kurzform | Nicht verwenden → ersetzen |
|---|---|---|---|
| Benutzerkonto | **Konto** (Elternkonto, Schülerkonto nur wenn nötig) | – | «Account», «Profil» (für das Konto), «Login» (für das Konto) |
| Persönliche Angaben | **Profil** (Nav «Mein Profil») | – | – |
| Einloggen | **Anmelden** / **Anmeldung** | – | «Login», «Einloggen» («Probleme beim Login» → «Probleme bei der Anmeldung») |
| Registrieren | **Konto erstellen** | – | «Registrieren», «Sign up» |
| Ausloggen | **Abmelden** | – | «Ausloggen», «Logout» |
| 7 Tage gratis | **Gratis-Testwoche** (Nomen) · **7 Tage gratis testen** (Fliesstext) | **Testwoche** (nach erster Nennung) | «Testphase», «Gratis-Testphase», «Probezeit», «Trial», «Gratiswoche», «Probewoche» |
| Haupt-CTA öffentliche Website | **Kostenlos testen** (einziges erlaubtes «kostenlos» im UI – fixer CTA) | – | «Loslegen», «Jetzt starten», «Gratis registrieren» |
| «ohne Kosten» im Fliesstext | **gratis** | – | «kostenlos» (ausser im CTA oben und in «kostenloser Pilot»), «umsonst», «free» |
| Generisch: bezahlter Zugang einer Person/Familie | **Abo** | – | «Abonnement», «Plan», «Mitgliedschaft» |
| Plan für 1 Schüler:in | **Einzelabo** | – | «Solo», «Solo-Abo», «Schülerabo» |
| Plan für 1 Elternteil + 1 Kind | **Familienpaket** (Name kommt aus `lib/billing/plans.ts` → `FAMILY.name`; nie hart codieren) | – | «Familien-Abo», «Familienabo», «Familienplan», «Familienkonto» als Planname. Offener Punkt für Panat: «Familienabo» wäre parallel zu «Einzelabo» – Umbenennung nur in plans.ts (Billing-Datei, nicht durch Builder) |
| Zugang der Schule | **Schullizenz** | **Lizenz** (im Schulkontext) | «Schul-Abo», «Jahreslizenz» als Name (als Beschreibung ok: «eine Schullizenz pro Jahr»), «Abo» für Schulen |
| Schulpakete | **Starter · Professional · Enterprise · Individuell** (Namen aus plans.ts) | – | «Basic», «Pro» |
| Schul-Testphase | **30-Tage-Pilot** | **Pilot** | «Testphase», «Probeabo» |
| Preisangebot an Schulen | **Offerte** | – | «Angebot» («Individuelles Angebot» → «Individuelle Offerte»), «Quote» |
| Zahlung mit Karte | **Karte** in Auswahlen, Langform **Kreditkarte** (PAYMENT_LABEL) | – | in Testwochen-Texten «ohne Karte» → **«ohne Zahlungsangaben»** (Karte ist mehrdeutig: Dorf/Suche) |
| Kündigen | **kündigen** («kündbar auf Ende der Laufzeit») | – | «abbestellen», «beenden» (für das Abo) |
| Kopie der eigenen Daten | **Daten exportieren** (so heisst der Button in den Einstellungen) | – | «Daten sichern», «Backup», «Download» |
| Konto löschen | **Konto löschen** | – | «Account entfernen» |
| Nach der Testwoche ohne Abo | **«Dein Zugang ist pausiert»** – du kannst deine Daten ansehen, exportieren und löschen | – | «gesperrt» (klingt nach Strafe; «Konto gesperrt» NUR für Sperre durch Admin) |

### 1.6 Klassen, Familie, Einladungen

| Konzept | Standard | Nicht verwenden → ersetzen |
|---|---|---|
| Gruppe einer Lehrperson | **Klasse** | «Gruppe», «Kurs» |
| Code zum Beitritt in eine Klasse | **Klassencode** | «Beitrittscode» (components/classes/teacher-classes.tsx:59, class-detail.tsx:97), «Einladungscode» für Klassen |
| Link zum Beitritt (Klasse, Familie, Freunde) | **Einladungslink** | «Beitrittslink», «Join-Link» |
| Code für Freunde/Familie | **Einladungscode** | «Familiencode», «Freundescode» |
| Bereich für Eltern + Kind | **Familie** (Nav), Seite «Meine Familie» | «Familienbereich», «Familienkonto» (als Bereichsname) |
| Freigabe-Schalter (Klasse) | exakt `CONSENT_LABELS` in lib/consent.ts: «Fortschritt teilen», «Status zeigen», «Firmen zeigen» | Varianten wie «Status teilen» |
| Teilen allgemein | **freigeben** / **Freigabe** | «sharen», «veröffentlichen» |
| Klassenziele | **Klassenziel** | «Klassen-Challenge» |
| Auswertungen | **Auswertung** (Schüler:innen-Bereich und Klassen) | «Statistiken», «Analysen», «Analytics» (Marketing darf «Auswertungen für die Klasse» sagen) |

### 1.7 Marke, Kontakt, Formate

- Produkt: **WendApply** (nie «Wendapply», «Wend Apply»). Firma: **Wendico** (Kollektivgesellschaft, Kleinandelfingen).
- Kontakt-E-Mail: heute zwei Adressen im Code: `info.wendico@gmail.com` (marketing.ts `CONTACT_EMAIL`, Legal, Konto löschen) und
  `support@wendapply.ch` (lib/access/gate.ts, /schullizenz). → **Offener Entscheid für Panat.** Bis dahin: öffentliche Website
  nur `CONTACT_EMAIL` aus marketing.ts verwenden, nie eine Adresse hart codieren.
- Geld: «CHF 7.90», «CHF 79», «CHF 1'490» (Apostroph als Tausendertrenner, `chf()`/`formatChf()` benutzen). «pro Monat», «pro Jahr»
  (nicht «/Mt.», «p. a.»). **Nie MWST erwähnen** (auch nicht «inkl. MWST»).
- Datum: «17.11.2026» bzw. «17. November 2026»; Zeit «14.30 Uhr». Dauer: «7 Tage», «30 Tage».
- Anführungszeichen: «Guillemets» für UI-Elemente im Fliesstext («Konto löschen»). Apostroph: ’ (So funktioniert’s).
- Zahlen 1–12 im Fliesstext ausschreiben ausser bei Mengen/Preisen/Tagen («drei Schritte», aber «7 Tage», «1 Elternteil»).

---

## 2. Du oder Sie (Entscheid)

| Bereich | Anrede |
|---|---|
| Ganze App (eingeloggt) – für ALLE Rollen inkl. Lehrperson, Schuladmin, Elternteil | **du** |
| Öffentliche Seiten für Schüler:innen und Eltern: Home, Funktionen, Für Eltern (/familien), FAQ, Hilfe, Anleitung, Preise-Teil «Für dich und deine Familie» | **du** |
| Öffentliche Seiten und Dokumente für Schulen: Für Schulen & Lehrpersonen (/schulen), Pilot, Preise-Teil «Für Schulen», Kontakt-Abschnitt Schulen, Offerten-/Demo-Mails (`MAIL.*` in marketing.ts), AVV, Datenschutz für Schulen | **Sie** |
| Auf Seiten mit gemischtem Publikum (Home, Funktionen, FAQ): Abschnitte für Lehrpersonen/Schulen | **neutral** (weder du noch Sie: «Lehrpersonen sehen …», «Klasse erstellen und einladen») |
| E-Mails (Bestätigung, Passwort, Erinnerungen, Familie) | **du** |

Begründung (3 Zeilen):
1. Die App hat EINE Shell mit gemeinsamen Komponenten (Einstellungen, Profil, Fehler, Toasts, Paywall); Sie-Seiten für Lehrpersonen
   würden auf demselben Screen neben du-Texten stehen. Heute ist der Lehrpersonen-Bereich schon zu ~92 % du (34 du : 3 Sie).
2. Schule kauft formell: Schulleitung, Gemeinde und Schulträger erwarten in Offerte, Vertrag und Verkaufsseite das Sie (heute schon so auf /schulen, /preise, /pilot).
3. Eltern sind Kundschaft im Familienpaket wie die Kinder; ein durchgehendes du auf /familien passt zum Produkt (heute dort 19× Sie → umstellen).

Wichtig: Abweichung vom Vorschlag des Orchestrators («Sie im Lehrpersonen-/Schulbereich der App»). Wer das kippt, ändert nur
Zeile 1 der Tabelle; alle anderen Regeln bleiben.

Regeln zum du: klein geschrieben («du», «dein»), auch in E-Mails. Plural «ihr» nur, wenn wirklich mehrere gemeint sind («Ihr seid jetzt befreundet»).

---

## 3. Tonregeln

1. **Schweizer Rechtschreibung:** immer «ss», nie «ß». Schweizer Wörter: Lehrstelle, Lehrbetrieb (Marketing), Schnupperlehre,
   Offerte, innert, Velo, parkieren. Keine deutschen Ausdrücke wie «Ausbildungsplatz», «Azubi», «Bewerbungsmappe», «Gymnasium» für Sek.
2. **Kurze Sätze.** Max. ~15 Wörter pro Satz in der App, ~20 auf der Website. Ein Gedanke pro Satz. Keine Schachtelsätze.
3. **Wortwahl für 13-Jährige:** Alltagswörter («Frist» statt «Deadline», «Firma» statt «Arbeitgeber»). Fachwort nur mit Erklärung.
4. **Buttons:** Verb zuerst (Infinitiv), **max. 3 Wörter**, kein Punkt, kein «!». «Bewerbung speichern», «Klasse erstellen», «Abo wählen».
   Nicht: «OK», «Ja», «Hier klicken», «Weiter» (nur in mehrstufigen Abläufen erlaubt). Gefährliche Aktion nennt das Objekt: «Konto löschen».
5. **Kein Füllwort, keine Übertreibung:** nicht «ganz einfach», «super», «genial», «revolutionär», «die beste App». Superlative nur mit Beleg.
6. **Ausrufezeichen:** max. eines pro Screen, nur für echte Erfolge (Zusage, Bestellung). Nie in Fehlern, nie in Buttons.
7. **Fehlermeldungen = Was ist passiert + Was tun.** Ohne Schuldzuweisung, ohne Technik (kein Code, kein «Error»).
   Formel: «[Objekt] konnte nicht [Aktion] werden. [Nächster Schritt].» Beispiel: «Die Bewerbung konnte nicht gespeichert werden.
   Prüfe deine Verbindung und versuch es noch einmal.» (Mechanik: `friendlyMessage(reason, fallback)` in lib/ux.ts; `fallback`
   immer nach dieser Formel.) Feldfehler direkt am Feld, als ganzer Satz: «Gib einen Firmennamen ein.»
8. **Erfolgsmeldungen** (Toast): Vergangenheit, kurz, Objekt nennen, kein «erfolgreich»: «Bewerbung gespeichert.» «Status geändert: Zusage.»
   Bei umkehrbaren Aktionen Button «Rückgängig».
9. **Leere Zustände** – Formel (EmptyState): **Titel** = was fehlt («Noch keine Bewerbungen») · **Text** = warum es nützt / was
   hier erscheint (1 Satz) · **Button** = die eine Aktion, die es füllt (Verb, max. 3 Wörter). Bei leeren Suchergebnissen
   stattdessen: Titel «Nichts gefunden» · Text = was man ändern kann · Button «Filter zurücksetzen».
10. **Bestätigungsdialoge:** Titel als Frage mit Objekt («Bewerbung löschen?»), Text = Folge («Das lässt sich nicht rückgängig
    machen.»), Buttons = Aktion + «Abbrechen» («Löschen» / «Abbrechen»), nie «Ja/Nein».
11. **Datenschutz-Sprache:** konkret und ehrlich: wer sieht was. Nie «100 % sicher», «absolut sicher», «DSGVO-zertifiziert».
    Nur Fakten aus docs/legal (EU/Irland-Datenbank, keine Werbung, kein Tracking, Konto selbst löschen).
12. **Geschlechtergerecht:** Paarform im Fliesstext («Schülerinnen und Schüler»), Doppelpunkt nur in Kurzformen (Schüler:in).
    Neutrale Wörter, wo es sie gibt (Lehrperson, Ansprechperson).
13. **Zahlen und Preise** nie hart codieren: Preise aus `FAMILY`, `PACKAGES`, `PLANS` (via marketing.ts / billing/logic.ts),
    Trial-Tage 7, Pilot `PILOT.days`.
14. **Emojis:** keine in der App-UI und auf der Website. (Erlaubt: in Social-Media-Posts.)

---

## 4. Standard-Microcopy

### 4.1 Primäre Buttons pro Hauptaufgabe

| Ort / Aufgabe | Primärer Button | Sekundär |
|---|---|---|
| Website Hero | **Kostenlos testen** → /login?mode=signup (Parameter existiert noch nicht: app/login/page.tsx öffnet heute immer den Tab «Anmelden»; Owner Login-Seite muss `mode=signup` lesen, bis dahin /login) | **Anmelden** → /login |
| Website Schulen | **Demo vereinbaren** (mailto MAIL.demo) | **Pilot anfragen** |
| Login | **Anmelden** | «Passwort vergessen?» (Link) |
| Signup | **Konto erstellen** | «Weiter mit Google» |
| Onboarding (mehrstufig) | **Weiter** / letzter Schritt **Fertig** | «Überspringen» |
| Neue Bewerbung | **Bewerbung eintragen** (Einstieg) / **Bewerbung speichern** (Formular) | «Abbrechen» |
| Suchtreffer | **Merken** (nach Klick: «Gemerkt») | «Stelle öffnen» |
| Status ändern | Statuspille antippen (kein extra Button) | – |
| Dokument | **Dokument hochladen** | «Anhängen» (in Bewerbung) |
| KI-Check | **Brief prüfen** | – |
| Klasse beitreten (Schüler:in) | **Klasse beitreten** | – |
| Klasse erstellen (Lehrperson) | **Klasse erstellen** | – |
| Einladen | **Schüler:innen einladen** (Klasse) · **Kind einladen** (Familie) · **Freunde einladen** | «Link kopieren» |
| Frist/Mitteilung (Lehrperson) | **Frist setzen** · **Mitteilung senden** | – |
| Paywall / Testwoche | **Abo wählen** (Eltern: **Familienpaket wählen**) | «Daten exportieren» |
| Abo | **Jetzt bezahlen** (Checkout) · **Abo verwalten** | – |
| Einstellungen | **Änderungen speichern** | – |
| Konto löschen | **Konto löschen** (Danger) | «Abbrechen» |
| Abmelden | **Abmelden** | – |

### 4.2 Leere Zustände (Titel · Text · Button)

| Liste | Titel | Text | Button |
|---|---|---|---|
| Bewerbungen | Noch keine Bewerbungen | Merke dir Stellen aus der Suche oder trag eine Bewerbung ein. Hier siehst du dann Status und Fristen. | Stelle suchen |
| Bewerbungen, Filter leer | Nichts gefunden | Prüfe die Schreibweise oder wähle einen anderen Status. | Filter zurücksetzen |
| Suche ohne Treffer | Keine Stellen gefunden | Versuch einen anderen Beruf, einen grösseren Umkreis oder «Alle» statt «Schweiz». | Filter zurücksetzen |
| Dokumente | Noch keine Dokumente | Lade deinen Lebenslauf hoch. Dann hängst du ihn mit einem Tipp an jede Bewerbung. | Dokument hochladen |
| Dokumente in einer Bewerbung | Noch nichts angehängt | Hänge Lebenslauf und Motivationsschreiben an, damit dein Dossier komplett ist. | Dokument anhängen |
| Auswertung | Noch nichts auszuwerten | Sobald du Bewerbungen einträgst, siehst du hier deinen Fortschritt. | Bewerbung eintragen |
| Fristen / Erinnerungen | Keine Fristen in Sicht | Trag bei einer Bewerbung «Bewerben bis» ein, dann erinnern wir dich. | – |
| Dorf (neu) | Dein Dorf ist noch leer | Jede Bewerbung wird hier zu einem Haus. | Bewerbung eintragen |
| Freunde | Noch keine Freunde | Teile deinen Einladungscode. Du entscheidest, was Freunde sehen. | Freunde einladen |
| Freundschaftsanfragen | Keine offenen Anfragen | – | – |
| Klassen (Schüler:in) | Du bist in keiner Klasse | Gib den Klassencode deiner Lehrperson ein. | Klasse beitreten |
| Klassen (Lehrperson) | Noch keine Klasse | Erstelle deine erste Klasse und teile den Klassencode. | Klasse erstellen |
| Klasse ohne Mitglieder | Noch keine Schüler:innen | Sobald jemand mit dem Klassencode beitritt, erscheint die Person hier. | Schüler:innen einladen |
| Schüler:in teilt nichts | Teilt keine Daten | Diese Person hat die Freigabe für die Klasse ausgeschaltet. | – |
| Familie (Elternteil, noch kein Kind) | Noch kein Kind verbunden | Lade dein Kind ein. Es entscheidet selbst, was du siehst. | Kind einladen |
| Mitteilungen (Klasse) | Noch keine Mitteilungen | Mitteilungen erreichen die ganze Klasse auf einmal. | Mitteilung senden |

### 4.3 Häufige Fehler (übernehmen, wo die Situation passt)

| Situation | Text |
|---|---|
| Offline / Netz | Keine Verbindung zum Internet. Prüfe dein Netz und versuch es noch einmal. |
| Anmeldung abgelaufen | Deine Anmeldung ist abgelaufen. Bitte melde dich neu an. |
| Keine Berechtigung | Dafür fehlt dir die Berechtigung. Melde dich neu an und versuch es noch einmal. |
| Zu viele Versuche | Zu viele Versuche. Warte einen Moment und versuch es dann noch einmal. |
| Serverfehler | Unser Server hat gerade ein Problem. Bitte versuch es gleich noch einmal. |
| Speichern fehlgeschlagen | [Objekt] konnte nicht gespeichert werden. Versuch es noch einmal. |
| Laden fehlgeschlagen | [Objekt] konnte nicht geladen werden. Lade die Seite neu. |
| Falsches Passwort | E-Mail oder Passwort stimmt nicht. Versuch es noch einmal oder setze dein Passwort zurück. |
| E-Mail nicht bestätigt | Bitte bestätige zuerst deine E-Mail-Adresse. Wir haben dir einen Link geschickt. |
| Konto existiert | Für diese E-Mail gibt es schon ein Konto. Melde dich an. |
| Passwort zu schwach | Dein Passwort ist zu kurz oder zu einfach. Nimm mindestens acht Zeichen. |
| Ungültiger Klassencode | Diesen Klassencode gibt es nicht. Prüfe ihn oder frag deine Lehrperson nach einem neuen. |
| Einladung abgelaufen | Diese Einladung ist abgelaufen. Bitte frag nach einem neuen Einladungslink. |
| Datei zu gross / falscher Typ | Diese Datei ist zu gross. Erlaubt sind PDF, JPG oder PNG bis [X] MB. |
| Pflichtfeld leer | Gib [Feld] ein. (z. B. «Gib einen Firmennamen ein.») |
| Testwoche vorbei (Paywall) | Deine Gratis-Testwoche ist vorbei. Mit einem Abo geht es sofort weiter. Deine Daten sind noch da. |
| Zahlung fehlgeschlagen | Die letzte Zahlung hat nicht geklappt. Aktualisiere die Zahlungsmethode unter «Abo verwalten». |
| Schullizenz voll | Die Schullizenz ist voll. Deine Schuladministration kann sie erweitern. |
| Keine Schullizenz (Lehrperson) | Deine Schule hat noch keine gültige Schullizenz. Schreib uns, wir helfen beim Start. |
| Unerwartet (Fallback) | Das hat nicht geklappt. Bitte prüfe deine Angaben und versuch es noch einmal. |

Hinweis: Die Fehlertexte in lib/ux.ts, lib/access/server.ts, lib/b2b/licence.ts, components/billing/logic.ts sind Logik-Dateien
(Billing/Access/B2B = gesperrt für Builder laut BRIEF-SHARED). Texte dort nur ändern, wenn die Datei ausdrücklich zur eigenen
Ownership gehört; sonst in Report vermerken. Die meisten passen bereits.

### 4.4 Erfolgsmeldungen (Toast)

Bewerbung gespeichert. · Status geändert: [Status]. · Bewerbung gelöscht. [Rückgängig] · Dokument hochgeladen. · Klasse erstellt. ·
Einladungslink kopiert. · Frist gesetzt. · Mitteilung gesendet. · Änderungen gespeichert. · Anfrage gesendet. · Ihr seid jetzt befreundet. ·
Daten exportiert. · Danke für deine Bestellung! (einziges «!» – Bezahlung erfolgreich)

---

## 5. Arbeitsliste: gefundene Abweichungen (Datei:Zeile)

Stand Commit 841465f. Zeilen können sich durch andere Branches verschieben – mit `grep` nachsuchen.
Spalte «Owner» = laut BRIEF-SHARED zuständiger Agent (web = ux-website, schüler = Schüler-Fixer/Shell, lp = Lehrperson-Fixer,
eltern = Eltern-Fixer, schule = Schul-Fixer, gesperrt = Logikdatei → nur melden).

### 5.1 Anrede (du/Sie)
| Stelle | Ist | Soll | Owner |
|---|---|---|---|
| app/page.tsx:90 | «ohne dass Sie dafür zusätzliche Listen führen» | neutral: «Sehen, wer Hilfe braucht, ohne zusätzliche Listen» | web |
| app/familien/page.tsx (19× Sie: Z. 34, 35, 36, 41, 42, 49, 61, 63 …) | Sie an Eltern | du («Du siehst, wie viele Bewerbungen laufen …», «dein Kind») | web |
| components/guide/content.tsx:129–134 (Anleitung, Teil Lehrpersonen) | Sie | neutral oder du (Anleitung = du-Seite) | web |
| app/hilfe/page.tsx Teil «Schulen, Preise und Pilot» | gemischt | Fragen von Schulen: neutral formulieren («Kann die Schule monatlich bezahlen?») | web |
| components/teacher/* (3× Sie), components/billing/* (2× Sie, z. B. billing/logic.ts:42 «Sie erhalten eine Rechnung») | Sie in der App | du («Du erhältst eine Rechnung per E-Mail …») | lp / gesperrt (logic.ts) |
| supabase/functions (5× Sie) | prüfen: in Beispielsätzen eines Motivationsschreibens ist «Sie» korrekt (Brief an Firma) | nicht ändern | – |

### 5.2 Begriffe
| Stelle | Ist | Soll | Owner |
|---|---|---|---|
| app/preise/page.tsx:46 (H1) | «Schüler bezahlen nichts.» | «Für Schülerinnen und Schüler gratis.» | web |
| app/preise/page.tsx:31,32,88,101; app/hilfe/page.tsx:35; app/familien/page.tsx:115 | «Schüleraccount», «Elternaccount» | «Schülerkonto», «Elternkonto» | web |
| app/datenschutz-uebersicht/page.tsx:80; lib/family-core.ts:336; lib/family-copy.ts:170 | «Schüler/in» | «Schüler:in» | web / eltern |
| components/admin/shared.tsx:82, users-tab.tsx:107, school-detail.tsx:43,170,206,239,288,320, schools-tab.tsx:103, free-access.tsx:25, user-detail.tsx:120,273 | «Lernende(:r)» | «Schüler:in / Schüler:innen» | admin (optional) |
| app/familien/page.tsx:40 | «Elternteil oder Jugendliche:r erstellt ein Konto» | «Elternteil oder Schüler:in erstellt ein Konto» | web |
| app/familien/page.tsx:40 (Titel) | «Registrieren» | «Konto erstellen» | web |
| app/kontakt/page.tsx:23; app/hilfe/page.tsx:44; lib/seo/pages.ts:58 | «Login» | «Anmeldung» («Probleme bei der Anmeldung») | web |
| components/settings/tour-replay.tsx:26 | «vom ersten Login» | «nach deiner ersten Anmeldung» | schüler |
| app/applications/[id]/page.tsx:139; components/applications/application-form.tsx:250; components/guide/content.tsx:69; components/applications/status-pills.tsx:15; app/applications/page.tsx:114; app/applications/[id]/page.tsx:61,68; lib/family-core.ts:222; components/classes/consent-switches.tsx:25; components/family/child-overview.tsx:31 | «Stand» für Status | «Status» («Was ist der Status?», «Status geändert: …», «Bewerbungen nach Status») | schüler / eltern |
| app/page.tsx:84; app/schulen/page.tsx:78; app/familien/page.tsx:34; components/guide/content.tsx:17,129; app/dashboard/page.tsx:150 | «Stand» für Fortschritt | «Fortschritt» | web / schüler |
| lib/family-copy.ts:107 | «den Stand deines Familienpakets» | «dein Familienpaket» («Wir konnten dein Familienpaket gerade nicht laden.») | eltern |
| app/applications/[id]/page.tsx:174 | Abschnitt «Unterlagen» | «Dokumente» | schüler |
| components/documents/application-documents.tsx:24,44,49; components/documents/document-library.tsx:89; components/guide/content.tsx:81; lib/status.ts:89 | «Unterlagen» | «Dokumente» (Z. 49: «Dossier: 3 von 5 Dokumenten dabei»; library:89: «… Arten von Dokumenten sind schon da.»; status.ts:89 «Deine Bewerbung ist unterwegs.») | schüler |
| app/schulen/page.tsx:26; app/familien/page.tsx:28 | «… Fristen und Unterlagen …» | «… Fristen und Dokumente …» | web |
| app/pilot/page.tsx:26; app/preise/page.tsx:125,126; components/public/marketing.ts:30 | «Datenschutz-Unterlagen» | «Datenschutz-Dokumente» | web |
| components/settings/abo-section.tsx:19; access-banner.tsx:17; access-pages.tsx:47; billing/abo-view.tsx:71,72 | «Gratis-Testwoche»/«Testwoche» | ✔ korrekt | – |
| app/familien/page.tsx:61 | «Gratis-Testphase», «ohne Karte» | «Gratis-Testwoche», «ohne Zahlungsangaben» | web |
| app/preise/page.tsx:25 | «… wird WendApply gesperrt …», «keine Karte» | «… ist dein Zugang pausiert: Du kannst deine Daten ansehen, exportieren und löschen.», «keine Zahlungsangaben» | web |
| lib/family-copy.ts:78,114; lib/family-core.ts:281; components/admin/shared.tsx:63; lib/admin/status.ts:54 «Probezeit» | «Testphase»/«Probezeit» | «Testwoche» (family-copy/family-core: eltern; admin: optional) | eltern / admin |
| components/admin/free-access.tsx:25,26 | «Keine Testphase» | «Keine Testwoche» | admin (optional) |
| app/api/account/delete/route.ts:53 | «das Familien-Abo», «das Schul-Abo» | «das Familienpaket», «die Schullizenz» | gesperrt (app/api) → melden |
| components/admin/user-detail.tsx:258; lib/admin/status.ts:44 | «Familien-Abo», «Schul-Abo» | «Familienpaket», «Schullizenz» | admin (optional) |
| app/hilfe/page.tsx:17; components/ai-review/review-result.tsx:91; lib/ai-review-core.ts:237,283 | «Betrieb» | «Firma» (ai-review-core = Beispielsätze; nur UI-Labels ändern, nicht die Beispieltexte im Brief) | web / schüler |
| app/page.tsx:17,103 (Home) | «Betriebe auf der Karte» | Marketing-Ausnahme: «Lehrbetriebe auf der Karte» ok | web |
| components/b2b/logic.ts:69; components/b2b/class-overview.tsx:33 | «Schnuppertage», «Schnuppertag gemacht oder geplant» | «Schnupperlehren», «Schnupperlehre gemacht oder geplant» | lp / schule |
| components/b2b/logic.ts:70; components/b2b/class-overview.tsx:32 | «Vorstellungsgespräch(e)» | «Gespräche», «Gespräch erhalten» | lp / schule |
| components/classes/teacher-classes.tsx:59; components/classes/class-detail.tsx:97; teacher-classes.tsx:46 | «Beitrittscode» | «Klassencode» | lp |
| app/preise/page.tsx:28,75,77; components/billing/billing-card.tsx:133; components/b2b/logic.ts:36; marketing.ts:74 | «Individuelles Angebot», «ein individuelles Angebot» | «Individuelle Offerte», «eine individuelle Offerte» | web / schule |
| components/access/access-pages.tsx:101 | «Angebot für Schulen» | «Für Schulen» | schüler |
| app/preise/page.tsx:30 | «Gibt es ein Angebot für Familien?» | «Gibt es etwas für Familien?» → besser: «Was kostet WendApply für Familien?» | web |
| app/schulen/page.tsx:20; marketing.ts:29 | «Statistiken» | «Auswertungen» | web |
| components/guide/content.tsx:14,111,115,148 und Einstellungen | «Mitteilung» für Push | «Benachrichtigung» (Lehrperson-Mitteilung bleibt «Mitteilung») | web / schüler |
| components/guide/content.tsx:151 (FAQ) | «unter Daten sichern» | «unter «Daten exportieren»» | web |
| app/preise/page.tsx:34 | «unter «Abo & Rechnung»» | Label prüfen: Schul-Billing-Karte heisst im UI wie? Muss exakt dem Abschnittstitel in /schul-admin entsprechen | web + schule |
| components/layout/workspace-shell.tsx:49 | Key «Lehrer» | ok (nur Suchbegriff, nicht sichtbar) | – |
| hilfe:«Bezahlt wird auf Rechnung nach Offerte, nicht in der App» vs. preise «Online abschliessen» (Flag) | widersprüchlich je nach Flag | Hilfe-Antwort an `onlinePaymentEnabled()` koppeln wie /preise | web |

### 5.3 Inhaltliche Widersprüche (nicht nur Wortwahl)
- **Monatliche Zahlung für Schulen:** /preise und /hilfe sagen «gegen Aufpreis möglich»; CATALOG.md: Schulen nur jährlich,
  `monthlySurchargePct: 0`, MONTHLY_SURCHARGE nur für manuelle Offerten. → Formulierung: «Die Schullizenz läuft jährlich.
  Andere Zahlungsrhythmen klären wir in der Offerte.» (keine Prozentzahl, keine Zusage).
- **Familienpaket buchbar?** /familien und /preise haben zwei Varianten (Flag on/off). Beide Varianten behalten; Texte im Copy-Deck.
- **Kontaktadresse** info.wendico@gmail.com vs. support@wendapply.ch (siehe 1.7).
- **KI-Dienst:** Der Bewerbungs-Check schickt Text an einen KI-Anbieter (supabase/functions/ai-review/anthropic.ts), aber
  docs/legal/hosting.md und die Datenschutzerklärung nennen keinen KI-Anbieter. → Gemeldet in _ux/findings/BUGS.md, Website-Copy
  erwähnt den Anbieter deshalb nicht namentlich, nur «ein KI-Dienst» (wie die bestehende FAQ).

---

## 6. Abgleich mit `_ux/PRINCIPLES.md` (gelesen 2026-11-17)

Übereinstimmend: ein Begriff pro Konzept (Heuristik 4), Fehler = was passiert ist + was tun, ohne «Oops», ohne «!» (R-4.4),
Buttons mit Verb zuerst, max. 3 Wörter (R-5.2), ein Primär-Button pro Viewport (R-5.1), leere Zustände mit 3 Teilen und genau
einem Button (R-8.5a), Einfache Sprache mit ≤ 15 Wörtern pro Satz und ≤ 3 Sätzen pro Absatz in der App, keine Tech- oder
englischen Wörter. Die Anrede überlässt PRINCIPLES §8 ausdrücklich diesem Glossar (Entscheid: §2 oben).

Präzisierungen, die vorgehen (weil sie hier genauer sind):
- PRINCIPLES Heuristik 2 nennt «Lehrbetrieb» als Wort der Nutzenden. In der **App** gilt trotzdem **«Firma»** (Feld,
  Freigabe-Schalter «Firmen zeigen», Datenschutzpanels; 58 Stellen, für 13-Jährige verständlich). «Lehrbetrieb» nur auf der
  Website/SEO (§1.2).
- Formulierung «nochmals»/«noch einmal»: Standard ist **«versuch es noch einmal»** (so steht es schon in lib/ux.ts). Das
  Beispiel in PRINCIPLES R-4.4 («versuche es nochmals») bitte entsprechend lesen.
- «Weiter» ist nur zwischen Schritten eines mehrstufigen Ablaufs erlaubt; der letzte Schritt nennt die Aktion («Fertig»,
  «Konto erstellen»). Das entspricht R-5.2.
- Leere Zustände: Der Titel sagt, was fehlt, der Text sagt, wofür der Ort da ist bzw. was hier erscheint, und der Button füllt ihn (= R-8.5a).
