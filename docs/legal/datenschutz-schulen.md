# Datenschutz für Schulen

**Stand:** 6. November 2026 · **Version:** 0.9 (Entwurf) · **Kontakt:** info.wendico@gmail.com

> **Hinweis:** Entwurf, nicht juristisch geprüft. Vor dem Versand an eine Schule, Schulgemeinde oder ein Schulamt muss eine Juristin oder ein Jurist (Datenschutzrecht) den Text und die AVV-Vorlage prüfen. Unsichere Stellen: «prüfen lassen».

## 1. Kurzüberblick

WendApply ist ein Werkzeug für die Berufswahl- und Bewerbungsbegleitung. Schülerinnen und Schüler führen ihre Bewerbungen selbst. Lehrpersonen sehen **nur, was die Lernenden für die Klasse freigeben**. Es gibt keine Werbung, keine Analyse-Tracker und keinen Verkauf von Daten. Die Datenbank liegt in der EU (Irland). Lernende können ihr Konto jederzeit selbst und vollständig löschen.

## 2. Rechtlicher Rahmen

- **Private Schulen:** revDSG (Bundesgesetz über den Datenschutz).
- **Öffentliche Schulen:** das jeweilige **kantonale Datenschutzgesetz** (Kanton Zürich: **IDG**, Gesetz über die Information und den Datenschutz, mit der Verordnung IDV). Die Nutzung eines externen Dienstes ist dort in der Regel ein **«Bearbeiten im Auftrag»** (im Kanton Zürich § 6 IDG i. V. m. § 25 IDV): Die Schule bleibt verantwortlich, braucht einen schriftlichen Vertrag und muss sich vergewissern, dass die Datensicherheit gewährleistet ist (§ 7 IDG). Die Datenschutzstellen weisen bei Cloud-Diensten zusätzlich auf Datenstandort und laufende Kontrolle hin.
- Die Konferenz der Schweizerischen Datenschutzbeauftragten (**privatim**) hat Merkblätter zu «Cloud Computing im Schulbereich» veröffentlicht. Sie sind für die Schule massgebend und von uns **nicht abschliessend ausgewertet** (**prüfen lassen**).
- Ob zusätzlich eine **Datenschutz-Folgenabschätzung** oder eine **Vorabkonsultation** der kantonalen Stelle nötig ist, entscheidet die Schule (**prüfen lassen**). Wir liefern die Informationen dafür (diese Seite, «Hosting», «Löschkonzept», AVV-Vorlage).

## 3. Rollen

| Rolle | Wer | Aufgabe |
|---|---|---|
| Verantwortlich | Die Schule (bzw. Trägerschaft) | entscheidet, ob und wie WendApply im Unterricht eingesetzt wird; informiert Lernende und Eltern |
| Auftragsbearbeiter | Betreiber WendApply (Panat Ruangsri) | bearbeitet Daten nur auf Weisung der Schule im vereinbarten Rahmen |
| Unterauftragsbearbeiter | siehe «Hosting» | Rechenzentrum, Auslieferung, E-Mail |
| Betroffene | Lernende, Lehrpersonen | haben Rechte auf Auskunft, Berichtigung, Löschung |

**Wichtig:** Lernende haben bei WendApply ein **eigenes Konto**, das sie auch privat weiterführen können. Für Bewerbungen, die nicht mit der Schule geteilt werden, ist die Schule nicht verantwortlich. Wie diese Doppelrolle rechtlich einzuordnen ist, ist **prüfen zu lassen**.

## 4. Welche Daten sieht die Lehrperson?

- Lehrpersonen sehen die **Mitglieder** ihrer Klasse (Anzeigename).
- Pro Schüler/in und Klasse gibt es **drei Freigaben**, die die Lernenden selbst steuern: **Bewerbungen teilen**, **Status teilen**, **Firmennamen teilen**. Ohne Freigabe erscheinen die Angaben nicht.
- Weitere Lehrpersonen (Co-Lehrpersonen) einer Klasse sehen dasselbe wie die Hauptlehrperson.
- Lehrpersonen können Mitteilungen an die Klasse senden und einzelne Lernende «anstupsen» (Benachrichtigung in der App).
- Die Zugriffsregeln werden **in der Datenbank** durchgesetzt (Row Level Security), nicht nur in der Oberfläche.

## 5. Datenminimierung

- Pflicht sind nur E-Mail-Adresse und Passwort (oder Google-Anmeldung) sowie ein Anzeigename. Profilangaben (Telefon, Wohnort usw.) sind freiwillig.
- Wir empfehlen Schulen, Lernenden **nicht ihren vollen Namen** als Anzeigenamen vorzugeben, wenn ein Vorname genügt.
- Keine Standortdaten, keine Kontakte, keine Mikrofon-/Kamerazugriffe, keine Werbe-ID.

## 6. Technische und organisatorische Massnahmen (Auszug)

- HTTPS, Passwörter als Hash, geheime Schlüssel nur serverseitig.
- Mandantentrennung durch Zugriffsregeln pro Zeile (Row Level Security) auf allen Tabellen.
- Konto-Löschung mit erneuter Bestätigung der Identität (frische Anmeldung) und Textbestätigung.
- Automatisierte Tests für die Löschung und die Zugriffsregeln.
- Keine Weitergabe an Werbe- oder Analysefirmen.
- **Offen / prüfen lassen:** Zwei-Faktor-Anmeldung, Penetrationstest, ISO-27001-Zertifikat (nicht vorhanden; Unterauftragsbearbeiter haben eigene Zertifikate, die zu prüfen sind).

## 7. Hosting und Ausland

Datenbank und Dateispeicher: Irland (EU). Webauslieferung: Netlify (USA, globales CDN). Details, Länder und Schutzmassnahmen (SCC, Data Privacy Framework): Seite «Hosting». Ob die Schule dies zulässt, hängt von ihrer kantonalen Praxis ab; manche Datenschutzstellen verlangen für Daten aus dem Schulbereich eine **Datenhaltung in der Schweiz oder EU** und besondere Vorsicht bei US-Anbietern (**prüfen lassen**).

## 8. Löschung am Klassenende

Siehe «Löschkonzept am Klassenende». Kurz: Lernende löschen ihr Konto selbst oder behalten es privat; Lehrpersonen archivieren die Klasse. Löscht eine Lehrperson ihr Konto, wird die Klasse an eine Co-Lehrperson übergeben oder gelöscht – die Lernenden behalten ihre eigenen Daten.

## 9. Ablauf der Einführung (Vorschlag)

1. Schulleitung/Datenschutzverantwortliche prüfen diese Unterlagen (und lassen sie rechtlich prüfen).
2. AVV unterzeichnen (Vorlage: Seite «AVV»).
3. Eltern und Lernende informieren (Kurzfassung für Jugendliche: Seite «Datenschutz für Jugendliche»).
4. Lehrperson legt Klasse an, Lernende treten per Link oder Code bei.
5. Am Ende des Schuljahres: Löschkonzept anwenden.

## 10. Kontakt und Meldungen

Fragen, Auskunftsbegehren und Meldungen von Sicherheitsvorfällen: **info.wendico@gmail.com**. Sicherheitsvorfälle melden wir der Schule **unverzüglich** (Ziel: innert 24 Stunden nach Kenntnis).
