import Link from "next/link";
import type { FaqItem } from "./faq";
import { FAMILY, PILOT, SOLO, TRIAL_DAYS } from "./marketing";

/**
 * The 13 questions of /faq (copy deck §8), grouped. Single source: the home page teaser and /familien pick questions from here
 * by text, so the wording is identical everywhere. Prices come from the catalogue constants, never typed in.
 */
export const FAQ_GROUPS: { id: string; title: string; items: FaqItem[] }[] = [
  { id: "kosten", title: "Kosten und Abo", items: [
    { q: "Was kostet WendApply?", a: `Die ersten ${TRIAL_DAYS} Tage sind gratis. Danach gibt es das ${SOLO.name} für ${SOLO.priceMonthText} pro Monat oder ${SOLO.priceYearText} pro Jahr und das ${FAMILY.name} für ${FAMILY.priceMonthText} pro Monat oder ${FAMILY.priceYearText} pro Jahr. Hat deine Schule eine Schullizenz, bezahlt die Schule und für dich ist WendApply gratis.` },
    { q: "Wie funktioniert die Gratis-Testwoche?", a: `Jedes neue Konto für Schülerinnen, Schüler und Eltern kann WendApply ${TRIAL_DAYS} Tage mit allen Funktionen testen. Du gibst dafür keine Zahlungsangaben an. Nach ${TRIAL_DAYS} Tagen endet die Testwoche automatisch, es wird nichts belastet.` },
    { q: "Was passiert nach der Gratis-Testwoche?", a: "Ohne Abo ist dein Zugang pausiert. Du kannst deine Daten weiter ansehen, exportieren und löschen. Mit einem Abo geht es sofort weiter, alles ist noch da." },
    { q: "Wie kündige ich mein Abo?", a: "In deinem Konto unter «Abo verwalten». Das Abo läuft bis zum Ende der bezahlten Zeit und verlängert sich danach nicht mehr." },
    { q: "Muss ich bezahlen, wenn meine Schule WendApply nutzt?", a: "Nein. Hat deine Schule eine Schullizenz und bist du in der Klasse deiner Lehrperson, bezahlt die Schule." },
  ] },
  { id: "klasse-eltern", title: "Klasse und Eltern", items: [
    { q: "Wie trete ich der Klasse meiner Lehrperson bei?", a: "Deine Lehrperson gibt dir einen Einladungslink, einen Klassencode oder einen QR-Code. Öffne den Link oder gib den Code unter «Klassen» ein. Vor dem Beitritt siehst du genau, was deine Lehrperson sehen wird." },
    { q: "Was sieht meine Lehrperson?", a: "Nur, was du beim Beitritt freigibst, zum Beispiel Anzahl und Status deiner Bewerbungen. Notizen, Lebenslauf und Dokumente sieht sie nie. Du kannst die Freigabe jederzeit ändern." },
    { q: "Was sehen meine Eltern?", a: "Nur, was du freigibst: standardmässig deinen Fortschritt und dein Dorf, die Bewerbungsliste nur, wenn du willst. Bist du unter 16, braucht das Teilen die Einwilligung deiner Eltern. Du kannst das Teilen jederzeit beenden." },
  ] },
  { id: "daten", title: "Daten und Sicherheit", items: [
    { q: "Wo liegen meine Daten?", a: <>Datenbank und Dateien liegen in einem Rechenzentrum in Irland (EU). Die Webseite wird über einen Anbieter aus den USA ausgeliefert. Alle Dienstleister stehen auf der Seite <Link href="/hosting">Hosting</Link>.</> },
    { q: "Kann ich mein Konto löschen und meine Daten mitnehmen?", a: "Ja. In den Einstellungen findest du «Daten exportieren» und «Konto löschen». Beim Löschen werden dein Konto und alle Daten entfernt." },
    { q: "Was passiert mit meinem Brief beim Bewerbungs-Check?", a: "Der Text wird für den Check an einen KI-Dienst geschickt. Die Datei wird nicht gespeichert, nur das Ergebnis in deinem Konto. Frühere Checks kannst du jederzeit löschen." },
  ] },
  { id: "app-schulen", title: "App und Schulen", items: [
    { q: "Brauche ich eine App aus dem App Store?", a: "Nein. WendApply läuft im Browser. Du kannst es aber direkt aus dem Browser als App auf Handy, Tablet oder Computer installieren." },
    { q: "Wie kann eine Schule WendApply testen?", a: <>Mit dem <Link href="/pilot">{PILOT.days}-Tage-Pilot</Link> für {PILOT.classes}. Er ist gratis. Lehrpersonen haben ohne Schullizenz oder Pilot keinen Zugang, darum gibt es für sie keine Gratis-Testwoche.</> },
  ] },
];

export const FAQ_ALL: FaqItem[] = FAQ_GROUPS.flatMap((g) => g.items);

/** Questions by their exact text (throws at build time if a question was renamed). */
export function pickFaq(questions: string[]): FaqItem[] {
  return questions.map((q) => {
    const item = FAQ_ALL.find((f) => f.q === q);
    if (!item) throw new Error(`FAQ question not found: ${q}`);
    return item;
  });
}
