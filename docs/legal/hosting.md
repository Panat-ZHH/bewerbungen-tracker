# Hosting-Orte und Unterauftragsbearbeiter

**Stand:** 6. November 2026 · **Version:** 0.9 (Entwurf) · **Kontakt:** info.wendico@gmail.com

> **Hinweis:** Entwurf, nicht juristisch geprüft. Die Angaben zu Zertifizierungen und Verträgen der Anbieter müssen vor dem Versand an Schulen auf den offiziellen Seiten der Anbieter bestätigt werden («prüfen lassen»).

## 1. Übersicht

| Dienst | Anbieter | Zweck | Datenstandort | Anbieter-Sitz | Schutzmassnahmen |
|---|---|---|---|---|---|
| Datenbank, Anmeldung, Dateispeicher | Supabase (Supabase Inc.) auf AWS | alle Konto-, Bewerbungs- und Klassendaten, hochgeladene Dateien | **Irland (AWS eu-west-1)**, geprüft am Projekt am 6. 11. 2026 | USA | Auftragsbearbeitungs-Vertrag (DPA) des Anbieters, Standardvertragsklauseln (SCC); Data Privacy Framework – Status prüfen lassen |
| Webauslieferung, serverseitige Funktionen | Netlify (Netlify, Inc.) | Ausliefern der Webseite, Programmcode des Servers (z. B. Konto löschen, Job-Suche) | weltweites CDN; Funktionen laufen in der vom Anbieter gewählten Region (**Region prüfen**) | USA | DPA des Anbieters, SCC; Data Privacy Framework – Status prüfen lassen |
| E-Mail-Versand (Bestätigung, Passwort-Reset, Erinnerungen) | **heute:** Standard-Versand von Supabase (ebenfalls AWS). **Geplant:** Brevo (Sendinblue SAS) | Zustellung von E-Mails | Brevo: EU (Frankreich) – bei Einführung bestätigen | Frankreich | EU-Recht, DPA; bei Einführung hier ergänzen |
| Anmeldung mit Google (optional) | Google | nur wenn Nutzende diese Anmeldung wählen | Google-Rechenzentren | Irland/USA | Nutzende entscheiden selbst; Datenschutzerklärung von Google gilt |
| Öffentliche Job-Portale | jobs.ch, jobup.ch, yousty.ch u. a. | Abruf **öffentlicher** Stelleninserate durch unseren Server | Schweiz | Schweiz | es werden nur Suchbegriffe übermittelt, **keine Kontodaten** |

## 2. Nicht eingesetzt

Keine Analyse-Dienste (z. B. Google Analytics), keine Werbenetzwerke, keine Social-Media-Plugins, keine externen Schriftarten oder Skripte von Drittanbietern, kein Session-Replay.

## 3. Standort der Datenbank

Das Supabase-Projekt von WendApply liegt in der Region **eu-west-1 (Irland)**. Datenbank und Datensicherungen verbleiben nach Angabe des Anbieters in dieser Region. Beim Betrieb kann Personal des Anbieters aus den USA im Rahmen der Wartung Zugriff haben – daher die Absicherung durch SCC.

## 4. Datenübermittlung in Länder ohne angemessenes Schutzniveau

- Für die **USA** kann sich ein Anbieter auf das **Swiss-U.S. Data Privacy Framework** stützen, wenn er dort zertifiziert ist. Ohne Zertifizierung sind **Standardvertragsklauseln** (SCC, in der von der Schweiz anerkannten Form mit Anpassung an das revDSG) nötig. Der Anbieter Supabase verweist in seinem DPA auf die SCC der EU-Kommission (Beschluss 2021/914). **Ob und in welcher Form das Schweizer Recht abgedeckt ist, ist zu prüfen** (z. B. Zusatz für das Schweizer Datenschutzrecht).
- Das Risiko von Behördenzugriffen in den USA (z. B. Cloud Act) bleibt trotz Vertrag bestehen. Manche kantonalen Datenschutzstellen sehen hier besondere Anforderungen für Schulen (**prüfen lassen**, ggf. Datenverschlüsselung oder Verzicht auf besonders schützenswerte Daten).

## 5. Verschlüsselung

Übertragung per HTTPS (TLS). Daten ruhen verschlüsselt beim Rechenzentrums-Anbieter (Verschlüsselung der Speichermedien). Es gibt **keine Ende-zu-Ende-Verschlüsselung**: Betreiber und Anbieter können Daten technisch lesen. Das steht in der Datenschutzerklärung.

## 6. Änderungen und Information

Neue oder gewechselte Unterauftragsbearbeiter teilen wir Schulen mit Vertrag **mindestens 30 Tage vorher** per E-Mail mit; die Schule kann widersprechen (siehe AVV). Die aktuelle Liste steht immer auf dieser Seite.
