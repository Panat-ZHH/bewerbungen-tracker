# Löschkonzept am Klassenende

**Stand:** 6. November 2026 · **Version:** 0.9 (Entwurf) · **Kontakt:** info.wendico@gmail.com

> **Hinweis:** Entwurf, nicht juristisch geprüft. Beschreibt, was die App **heute** kann. Automatische Löschfristen sind **noch nicht eingebaut** (siehe Abschnitt 6). Aufbewahrungspflichten der Schule sind rechtlich zu klären («prüfen lassen»).

## 1. Grundsatz

Die persönlichen Bewerbungsdaten gehören den **Lernenden**. Sie entscheiden am Ende der Schulzeit, ob sie ihr Konto behalten (z. B. für die weitere Stellensuche) oder löschen. Die **Klasse** (Mitgliederliste, Freigaben, Mitteilungen) gehört der Lehrperson bzw. der Schule und kann am Klassenende archiviert oder gelöscht werden.

## 2. Was passiert wann? (Übersicht)

| Zeitpunkt | Aktion | Wer | Was wird gelöscht / geändert |
|---|---|---|---|
| Jederzeit | Freigabe widerrufen | Lernende | Lehrperson sieht Bewerbungen, Status bzw. Firmennamen nicht mehr; Daten der/des Lernenden bleiben unverändert |
| Jederzeit | Klasse verlassen | Lernende | Mitgliedschaft und Freigaben dieser Klasse; persönliche Daten bleiben |
| Klassenende | Klasse archivieren | Lehrperson | Klasse bleibt lesbar, wird als archiviert markiert; keine neuen Beitritte |
| Klassenende | Lernende entfernen / Klasse löschen | Lehrperson | Mitgliedschaften, Freigaben, Mitteilungen, Einladungen der Klasse; persönliche Konten der Lernenden bleiben bestehen |
| Jederzeit | **Konto löschen** | Lernende oder Lehrperson | alles zu diesem Konto, siehe Abschnitt 3 |
| Nach Vertragsende | Klassendaten der Schule löschen | Betreiber auf Verlangen der Schule | Klassen, Mitgliedschaften, Freigaben, Mitteilungen |

## 3. Konto löschen (vorhanden)

**Wo:** Einstellungen → «Konto löschen». Zur Sicherheit muss man sich kurz vorher erneut mit Passwort oder Google anmelden und «LÖSCHEN» bzw. die eigene E-Mail-Adresse eintippen. Vorher zeigt die App, was gelöscht wird (Zahl der Bewerbungen, Unterlagen, Freunde, Klassen).

**Was wird sofort und dauerhaft gelöscht:**

- das Anmeldekonto (E-Mail, Passwort-Hash, Sitzungen),
- Profil und Rolle, Avatar-Datei,
- alle Bewerbungen und Unterlagen samt hochgeladenen Dateien,
- Spielwelt-Daten (Punkte, Gegenstände, Inseln, Belohnungen),
- Freundschaften und Anfragen,
- Klassen-Mitgliedschaften und Freigaben,
- Benachrichtigungen, Einladungen, Mitteilungen des Kontos.

Technisch: Der Server löscht zuerst die Dateien im Speicher, dann das Anmeldekonto; alle zugehörigen Tabellenzeilen werden durch die Datenbank automatisch mitgelöscht (Fremdschlüssel mit «on delete cascade»). Eine Prüfroutine kontrolliert, dass keine Zeilen zurückbleiben.

**Lehrpersonen:** Hat eine Klasse eine Co-Lehrperson, wird die Klasse an diese **übergeben** (die Lernenden behalten ihre Klasse). Ohne Co-Lehrperson wird die Klasse mit dem Konto gelöscht; die **Lernenden bleiben mit all ihren eigenen Daten bestehen**, nur die Mitgliedschaft entfällt.

**Nicht rückgängig zu machen.** Wer später wieder nutzen will, legt ein neues Konto an.

## 4. Aufbewahrung

| Daten | Aufbewahrung |
|---|---|
| Konto, Bewerbungen, Unterlagen | bis zur Löschung durch die Person selbst |
| Klasse, Mitgliedschaften, Freigaben | bis zur Löschung der Klasse oder Archivierung durch die Lehrperson |
| Datensicherungen beim Datenbank-Anbieter | überschrieben nach dem Zyklus des Anbieters ([x Tage – eintragen]); nach Konto-Löschung theoretisch noch in Sicherungen vorhanden, aber nicht abrufbar |
| Server-Protokolle der Hosting-Anbieter | kurzzeitig nach Vorgaben der Anbieter |
| Aufbewahrungspflichten der Schule | Entscheid der Schule (z. B. Archivgesetz) – **prüfen lassen**; WendApply ist kein Archiv |

## 5. Empfehlung für Schulen (Ablauf am Klassenende)

1. **4 Wochen vorher:** Lehrperson informiert die Lernenden über das Klassenende und ihre Optionen.
2. **Lernende wählen:** (a) Konto behalten und die Klasse verlassen, (b) Konto löschen.
3. **Klassenende:** Lehrperson archiviert die Klasse (Ansicht bleibt zur Dokumentation).
4. **Spätestens [x Monate] nach Schuljahresende:** Lehrperson löscht die archivierte Klasse.
5. **Nach Vertragsende:** Schule kann beim Betreiber (info.wendico@gmail.com) die Löschung aller Klassendaten verlangen; Bestätigung per E-Mail.

## 6. Noch nicht umgesetzt (offen)

- **Automatische Löschung** archivierter Klassen nach Frist.
- **Sammel-Löschung aller Schülerkonten** durch die Schule (heute löscht jede Person ihr Konto selbst; das ist rechtlich zu bewerten, siehe AVV Ziff. 12).
- **Hinweis-E-Mail** vor der Löschung inaktiver Konten.
- **Datenexport** für Lernende als Datei (heute auf Anfrage).

Diese Punkte sind Entwicklungsaufgaben; das Dokument wird nachgeführt, wenn sie umgesetzt sind.

## 7. Anfragen

Löschung oder Auskunft, wenn jemand sein Konto nicht mehr erreichen kann: info.wendico@gmail.com. Wir prüfen die Identität (z. B. Antwort von der hinterlegten Adresse) und löschen innert 30 Tagen.
