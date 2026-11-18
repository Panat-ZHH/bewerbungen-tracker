import type { ReactNode } from "react";
import { Bell, BriefcaseBusiness, FileText, GraduationCap, House, Search, Sparkles, UserRound, Users } from "lucide-react";

/** All texts of /anleitung. Labels in «» are copied from the app UI so the guide matches what students see. */

const k = (s: string) => <strong className="font-semibold">«{s}»</strong>;

export const features: { icon: typeof Search; title: string; text: string; step: string }[] = [
  { icon: Search, title: "Lehrstellen suchen", text: "Yousty, jobs.ch und jobup.ch auf einmal durchsuchen, nach Ort und Umkreis filtern und Stellen mit einem Tipp merken.", step: "suchen" },
  { icon: BriefcaseBusiness, title: "Bewerbungen im Griff", text: "Status, Fristen, Ansprechperson und Notizen an einem Ort, von «Gemerkt» bis «Vertrag unterschrieben».", step: "bewerbungen" },
  { icon: FileText, title: "Dokumente", text: "Lebenslauf, Motivationsschreiben und Zeugnisse hochladen und an Bewerbungen anhängen.", step: "dokumente" },
  { icon: Sparkles, title: "KI-Bewerbungs-Check", text: "Punkte und konkrete Tipps mit Vorher-Nachher-Sätzen für dein Motivationsschreiben.", step: "ki-check" },
  { icon: House, title: "Dein Dorf", text: "Jede Bewerbung wird ein Haus. Mit Punkten kaufst du im Laden Deko, Autos und neue Inseln.", step: "dorf" },
  { icon: Bell, title: "Erinnerungen", text: "Fristen und Nachfassen nicht verpassen: auf der Startseite, per E-Mail oder als Benachrichtigung.", step: "erinnerungen" },
  { icon: Users, title: "Freunde und Klassen", text: "Gemeinsam dranbleiben. Du entscheidest, was Freunde und deine Lehrperson sehen.", step: "freunde-klassen" },
  { icon: UserRound, title: "Profil", text: "Wunschberuf, Wohnort und Schule einmal angeben, damit Suche und Tipps besser passen.", step: "profil" },
  { icon: GraduationCap, title: "Für Lehrpersonen", text: "Klassen erstellen, Fortschritt der Klasse sehen, Fristen und Mitteilungen an alle schicken.", step: "lehrpersonen" },
];

export type GuideStep = {
  id: string;
  title: string;
  intro: string;
  steps: ReactNode[];
  tip?: ReactNode;
  shot?: { src: string; darkSrc?: string; alt: string; width: number; height: number; caption?: string };
};

export const guideSteps: GuideStep[] = [
  {
    id: "konto", title: "Konto erstellen",
    intro: "Du brauchst nur eine E-Mail-Adresse oder ein Google-Konto.",
    steps: [
      <>Öffne <a className="font-semibold text-[var(--brand)] underline underline-offset-4" href="/login">wendapply.ch/login</a> und wähle {k("Konto erstellen")}, oder melde dich mit {k("Weiter mit Google")} an.</>,
      <>Mit E-Mail: Adresse und Passwort (mindestens 6 Zeichen) eingeben und danach den Link in der Bestätigungs-E-Mail antippen.</>,
      <>Unter {k("Ich bin")} wählst du {k("Schüler:in")}. Lehrpersonen wählen {k("Lehrperson")}.</>,
      <>Eine kurze Einführung führt dich durch {k("Willkommen")}, {k("Profil & Ziele")}, {k("Erste Bewerbung")} und {k("KI-Check")}. Jeder Schritt lässt sich überspringen.</>,
    ],
    tip: <>Die Einführung kannst du jederzeit in den Einstellungen mit {k("Einführung nochmals ansehen")} wiederholen.</>,
  },
  {
    id: "profil", title: "Profil ausfüllen",
    intro: "Je mehr WendApply über deine Ziele weiss, desto besser passen Suche und Tipps.",
    steps: [
      <>Öffne {k("Mein Profil")}: am Computer oben rechts über dein Profilbild, auf dem Handy über {k("Mehr")}.</>,
      <>Trage Vorname, Wohnort, Schule, {k("Klasse / Schulstufe")} und deinen Wunschberuf ein.</>,
      <>Unter {k("Profilbild")} kannst du ein Bild hochladen oder direkt ein {k("Foto aufnehmen")} (PNG, JPEG oder WebP, max. 5 MB). Ohne Bild zeigt WendApply deine Initialen.</>,
      <>Speichere mit {k("Änderungen speichern")}.</>,
    ],
  },
  {
    id: "suchen", title: "Lehrstellen suchen",
    intro: "Unter «Suchen» durchsucht WendApply mehrere Stellenbörsen gleichzeitig: Yousty, jobs.ch und jobup.ch.",
    steps: [
      <>Wähle oben die Art der Suche: {k("Lehrstelle")}, {k("Praktikum")} oder {k("Job")}.</>,
      <>Gib Beruf und Ort ein, zum Beispiel «Informatiker Zürich».</>,
      <>Grenze mit {k("Ort")} und {k("Umkreis")} (5 bis 50 km) ein, oder nutze weitere Filter wie {k("Kantone")}, {k("Berufsfeld")} und {k("Start / Lehrbeginn")}. Sortieren nach Entfernung geht auch.</>,
      <>Gefällt dir eine Stelle, tippe auf {k("Merken")}. Sie landet als Bewerbung mit Status {k("Gemerkt")} in deiner Liste.</>,
    ],
    tip: <>Achte auf das Abzeichen {k("Schnupperlehre möglich")}. Suchen, die du öfter brauchst, speicherst du unter {k("Gespeicherte Suchen")}.</>,
    shot: { src: "/landing/05-search-light.webp", darkSrc: "/landing/05-search-dark.webp", alt: "Lehrstellensuche in WendApply: Suche nach «Informatiker» mit Filtern für Ort, Kanton und Art der Stelle und passenden Lehrstellen", width: 1600, height: 1280 },
  },
  {
    id: "bewerbungen", title: "Bewerbung erfassen und Status ändern",
    intro: "Jede Bewerbung hat einen Status. So siehst du immer, wo du stehst und was als Nächstes kommt.",
    steps: [
      <>Gehe zu {k("Bewerbungen")} und tippe auf {k("Bewerbung eintragen")}, oder öffne eine gemerkte Stelle.</>,
      <>Trage Firma, Stelle und Ort ein und setze {k("Bewerben bis")}, damit dich WendApply an die Frist erinnert. Ansprechperson und Notizen sind freiwillig.</>,
      <>Unter {k("Status")} wählst du: Gemerkt, In Vorbereitung, Abgeschickt, Schnupperlehre geplant oder gemacht, Eignungstest / Multicheck, Gespräch, Weiteres Gespräch, Zusage, Vertrag unterschrieben, Absage erhalten oder Zurückgezogen.</>,
      <>Auf der Detailseite siehst du die {k("Zeitachse")} und kannst mit {k("Frist im Kalender speichern")} die Frist in deinen Kalender übernehmen.</>,
    ],
    tip: <>Unter {k("Auswertung")} siehst du, wie viele Rückmeldungen und Gespräche du schon hast. Auf der Startseite hilft dir das {k("Wochenziel")}, dranzubleiben.</>,
    shot: { src: "/landing/04-dashboard-light.webp", darkSrc: "/landing/04-dashboard-dark.webp", alt: "Startseite mit dem Weg zur Lehrstelle, zuletzt geänderten Bewerbungen und bald fälligen Fristen", width: 1600, height: 1280, caption: "Auf der Startseite siehst du Fristen, Erinnerungen und deinen Weg zur Lehrstelle." },
  },
  {
    id: "dokumente", title: "Lebenslauf und Dokumente",
    intro: "Unter «Dokumente» sammelst du alles, was in dein Bewerbungsdossier gehört.",
    steps: [
      <>Tippe auf {k("Dokument hochladen")} und wähle die Art: Lebenslauf, Motivationsschreiben, Zeugnis, Foto oder Weiteres Dokument.</>,
      <>Erlaubt sind PDF, JPG und PNG bis 5 MB. Vom Motivationsschreiben kannst du mehrere Versionen speichern.</>,
      <>In einer Bewerbung hängst du unter {k("Dokumente")} die passenden Dokumente an. Eine Checkliste zeigt, was noch fehlt.</>,
    ],
  },
  {
    id: "ki-check", title: "KI-Bewerbungs-Check",
    intro: "Lass dein Motivationsschreiben von einer KI prüfen und hol dir konkrete Verbesserungsvorschläge.",
    steps: [
      <>Öffne den {k("Bewerbungs-Check")} oder tippe in einer Bewerbung auf {k("Bewerbung checken lassen")}. Dann sind Firma und Beruf schon ausgefüllt.</>,
      <>Lade deinen Brief als PDF oder Word-Datei (.docx, max. 5 MB) hoch. Wenn du das {k("Stelleninserat")} einfügst, passen die Tipps genau zur Firma.</>,
      <>Bestätige, dass dein Text für den Check an die KI geschickt wird, und tippe auf {k("Bewerbung checken")}. Das dauert etwa 10 bis 30 Sekunden.</>,
      <>Du bekommst bis zu 100 Punkte, aufgeteilt auf Aufbau, Sprache, Motivation, Passung zur Firma und Rechtschreibung, dazu Vorher-Nachher-Sätze zum Kopieren.</>,
    ],
    tip: <>Lösch vorher heikle Angaben wie deine AHV-Nummer. Gespeichert wird nur das Ergebnis, nicht deine Datei. Eine KI kann sich irren: Lass deinen Brief auch von einer Lehrperson oder deinen Eltern lesen.</>,
  },
  {
    id: "dorf", title: "Dein Dorf und der Laden",
    intro: "Unter «Dorf» wird jede Bewerbung zu einem Haus. Je weiter du kommst, desto grösser wird es.",
    steps: [
      <>Eine gemerkte Stelle startet als Baustelle. Mit jedem Schritt wächst das Haus, bei einer Zusage wird es zum Palast. Eine Absage bleibt als Ruine stehen.</>,
      <>Für jede abgeschickte Bewerbung bekommst du einmalig 100 Punkte, für höchstens 10 Bewerbungen pro Tag. Trägst du mehr ein, bekommst du die restlichen Punkte an den nächsten Tagen automatisch. Die Punkte bleiben dir, auch wenn du den Status später änderst.</>,
      <>Im {k("Laden")} kaufst du mit deinen Punkten Strassen, Bäume, Brunnen, E-Roller und Autos. Danach {k("Platzieren")}, drehen oder verschieben.</>,
      <>Mit genug Punkten schaltest du neue Inseln frei, eine nach der anderen.</>,
    ],
    shot: { src: "/guide/dorf-light.webp", darkSrc: "/guide/dorf-dark.webp", alt: "Das Dorf in WendApply: ein beschriftetes Haus für jede Bewerbung, ein Palast für eine Zusage und eine Ruine für eine Absage", width: 1600, height: 837, caption: "Jedes Haus ist eine Bewerbung. Die Beschriftung zeigt Firma und Status." },
  },
  {
    id: "erinnerungen", title: "Erinnerungen einstellen",
    intro: "WendApply erinnert dich an Fristen und daran nachzufragen, wenn lange nichts passiert ist.",
    steps: [
      <>Öffne {k("Einstellungen")} und dort {k("Benachrichtigungen")}.</>,
      <>Wähle, wie du erinnert werden willst: {k("Im Start-Bereich anzeigen")}, {k("Täglich per E-Mail")} oder als {k("Benachrichtigung auf diesem Gerät")}.</>,
      <>Lege fest, wie viele Tage vor einer Frist du erinnert wirst und nach wie vielen Tagen ohne Update.</>,
      <>Mit dem {k("Kalender-Abo für alle Fristen")} erscheinen alle Fristen automatisch in deinem Kalender.</>,
    ],
    tip: <>Auf dem iPhone funktionieren Benachrichtigungen nur, wenn du WendApply zuerst <a className="font-semibold text-[var(--brand)] underline underline-offset-4" href="#installieren">auf den Home-Bildschirm legst</a>.</>,
  },
  {
    id: "freunde-klassen", title: "Freunde und Klassen",
    intro: "Zu zweit fällt die Suche leichter. Was andere von dir sehen, bestimmst immer du.",
    steps: [
      <>Unter {k("Freunde")} findest du {k("Dein Einladungscode")}. Teile ihn per Link, QR-Code, WhatsApp oder E-Mail, oder gib den Code einer Freundin oder eines Freundes ein und tippe auf {k("Anfrage senden")}.</>,
      <>Freunde sehen, wie viele Bewerbungen du hast, wie weit du bist und dein Dorf, nie deine Notizen. Mit den Schaltern entscheidest du, ob Firmennamen und Zusagen oder Absagen sichtbar sind.</>,
      <>Deiner Klasse trittst du mit dem Link oder QR-Code deiner Lehrperson bei, oder du gibst unter {k("Klassen")} den {k("Klassencode")} ein und tippst auf {k("Beitreten")}.</>,
      <>Vor dem Beitritt siehst du genau, was {k("Sichtbar")} ist und was {k("Nie sichtbar")} bleibt. Notizen, Lebenslauf und Dokumente sieht deine Lehrperson nie. Die Freigaben kannst du später ändern.</>,
    ],
  },
  {
    id: "lehrpersonen", title: "Für Lehrpersonen",
    intro: "Mit WendApply siehst du den Fortschritt deiner Klasse, ohne Listen zu führen. Du siehst nur, was Schülerinnen und Schüler freigeben.",
    steps: [
      <>Konto erstellen und {k("Lehrperson")} wählen. Danach Anzeigename, Klassenname und Schuljahr eingeben und {k("Klasse erstellen")}.</>,
      <>Unter {k("Einladen")} teilst du Link, Klassencode oder QR-Code. Du kannst Schülerinnen und Schüler auch per E-Mail oder mit einer CSV-Datei einladen.</>,
      <>Die Übersicht zeigt Bewerbungen, Zusagen, wer {k("Braucht Aufmerksamkeit")} und {k("Anstehende Fristen")}.</>,
      <>Mit {k("Neue Frist")} und {k("Neue Mitteilung")} erreichst du die ganze Klasse. Exporte gibt es als CSV.</>,
    ],
    tip: <>Mehr zum 30-Tage-Pilot und zu den Lizenzen unter <a className="font-semibold text-[var(--brand)] underline underline-offset-4" href="/schulen">Für Schulen</a>, <a className="font-semibold text-[var(--brand)] underline underline-offset-4" href="/pilot">Pilot</a> und <a className="font-semibold text-[var(--brand)] underline underline-offset-4" href="/preise">Preise</a>.</>,
    shot: { src: "/landing/24-teacher-dashboard-light.webp", darkSrc: "/landing/24-teacher-dashboard-dark.webp", alt: "Lehrpersonen-Übersicht mit Bewerbungen, Gesprächen und Zusagen der Klassen und Schülerinnen und Schülern, die Aufmerksamkeit brauchen", width: 1600, height: 1280 },
  },
];

/** Plain-text answers: they are reused verbatim in the FAQPage JSON-LD. */
export const faq: { q: string; a: string }[] = [
  { q: "Kostet WendApply etwas?", a: "Jedes neue Konto kann WendApply 7 Tage gratis testen. Danach gibt es das Einzelabo (CHF 4.90 pro Monat oder CHF 49 pro Jahr) oder das Familienpaket (CHF 7.90 pro Monat oder CHF 79 pro Jahr). Hat deine Schule eine Lizenz, bezahlt die Schule. Schulen können WendApply vorher 30 Tage mit 1 bis 2 Klassen testen. Preise stehen auf wendapply.ch/preise." },
  { q: "Müssen Schülerinnen und Schüler bezahlen?", a: "Mit Schullizenz nicht: Dann bezahlt die Schule. Ohne Schullizenz kannst du WendApply 7 Tage gratis testen, danach brauchst du ein Abo (Einzelabo oder Familienpaket deiner Eltern). Punkte für dein Dorf gibt es nur für deine Schritte bei der Lehrstellensuche, nie für Geld." },
  { q: "Muss ich WendApply aus dem App Store laden?", a: "Nein. WendApply läuft im Browser. Du kannst es aber direkt aus dem Browser als App auf deinem Handy, Tablet oder Computer installieren, ganz ohne App Store." },
  { q: "Ist die installierte App anders als die Webseite?", a: "Nein, es ist dieselbe WendApply mit deinem Konto und deinen Daten. Die App öffnet sich nur im eigenen Fenster ohne Adresszeile und startet mit einem Tipp vom Home-Bildschirm." },
  { q: "Wie entferne ich die App wieder?", a: "iPhone und Android: Symbol gedrückt halten und entfernen bzw. deinstallieren. Mac und Windows: in der App das Menü öffnen und deinstallieren. Dein Konto und deine Daten bleiben dabei erhalten." },
  { q: "Warum bekomme ich auf dem iPhone keine Benachrichtigungen?", a: "Apple erlaubt Benachrichtigungen von Web-Apps nur, wenn sie auf dem Home-Bildschirm installiert sind. Installiere WendApply über Safari, öffne es vom Home-Bildschirm und schalte dann in den Einstellungen unter Benachrichtigungen die Benachrichtigung auf diesem Gerät ein." },
  { q: "Sieht meine Lehrperson alle meine Bewerbungen?", a: "Nein. Du entscheidest beim Beitritt zur Klasse, was geteilt wird, und kannst das später ändern. Notizen, Lebenslauf und Dokumente sieht deine Lehrperson nie." },
  { q: "Was passiert mit meinem Brief beim KI-Check?", a: "Der Text wird für den Check an einen KI-Dienst geschickt. Deine Datei wird nicht gespeichert, nur das Ergebnis in deinem Konto. Frühere Checks kannst du jederzeit löschen." },
  { q: "Kann ich mein Konto löschen?", a: "Ja. In den Einstellungen findest du Konto löschen. Dein Konto und alle Daten werden damit entfernt. Vorher kannst du unter «Daten exportieren» eine Kopie herunterladen." },
];
