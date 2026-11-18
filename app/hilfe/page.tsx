import type { Metadata } from "next";
import { publicMetadata, publicBreadcrumb } from "@/lib/seo/pages";
import { JsonLd } from "@/components/seo/json-ld";
import { faqJsonLd } from "@/lib/seo/site";
import Link from "next/link";
import { Faq, type FaqItem } from "@/components/public/faq";
import { CONTACT_EMAIL, TextPage } from "@/components/public/public-shell";
import { FAMILY, PACKAGES, PILOT, chf } from "@/components/public/marketing";
import { PAYMENT_LABEL, onlinePaymentEnabled } from "@/components/billing/logic";
import { PLANS, formatChf } from "@/lib/billing/plans";

export const metadata: Metadata = publicMetadata({ canonical: "/hilfe" });

/** Online payment on? Same build-time flag as /preise, so the school-billing answer never contradicts the app. */
const online = onlinePaymentEnabled();
const SOLO = { name: PLANS.solo.name, month: formatChf(PLANS.solo.priceChfPerMonth ?? 0), year: formatChf(PLANS.solo.priceChfPerYear ?? 0) };

const link = "font-medium text-[var(--brand)] underline underline-offset-4";

const groups: { id: string; title: string; items: FaqItem[] }[] = [
  { id: "schueler", title: "Erste Schritte für Schülerinnen und Schüler", items: [
    { q: "Wie starte ich?", a: <>Auf <Link className={link} href="/login">Kostenlos testen</Link> ein Konto erstellen und «Schüler:in» wählen. Danach kannst du Stellen suchen und deine erste Bewerbung eintragen.</> },
    { q: "Wie trage ich eine Bewerbung ein?", a: "Im Bereich «Bewerbungen» auf «Bewerbung eintragen» tippen, Firma und Stelle eingeben, Status und Frist festlegen. Du kannst jederzeit Notizen ergänzen und den Status ändern." },
    { q: "Wie trete ich der Klasse bei?", a: "Deine Lehrperson gibt dir einen Link, einen Code oder einen QR-Code. Öffne den Link oder gib den Code im Bereich «Klassen» ein. Vor dem Beitritt siehst du genau, was die Lehrperson sehen wird." },
    { q: "Was ist der Bewerbungs-Check?", a: <>Im <Link className={link} href="/bewerbung-check">Bewerbungs-Check</Link> lädst du deinen Brief als PDF oder Word-Datei hoch. Eine KI gibt dir Punkte und Tipps mit Beispielsätzen. Deine Datei wird nicht gespeichert, nur das Ergebnis. Eine KI kann sich irren: Lass deinen Brief auch von einer Lehrperson oder deinen Eltern lesen.</> },
    { q: "Muss ich der Lehrperson alles zeigen?", a: "Nein. Du entscheidest beim Beitritt, was geteilt wird, und kannst das später ändern." },
  ] },
  { id: "lehrperson", title: "Erste Schritte für Lehrpersonen", items: [
    { q: "Wie erstelle ich eine Klasse?", a: <>Konto erstellen, Rolle «Lehrperson» wählen, im Bereich «Klassen» auf «Klasse erstellen» klicken. Danach erstellst du einen Einladungslink, Klassencode oder QR-Code. Mehr unter <Link className={link} href="/schulen">Für Schulen</Link>.</> },
    { q: "Was sehe ich von meinen Schülerinnen und Schülern?", a: "Nur das, was sie ausdrücklich freigeben, zum Beispiel Anzahl und Status der Bewerbungen. Alles andere bleibt privat." },
  ] },
  { id: "schulen", title: "Schulen, Preise und Pilot", items: [
    { q: "Müssen Schülerinnen und Schüler bezahlen?", a: "Hat die Schule eine Lizenz, nicht: Dann bezahlt die Schule, die Gemeinde oder der Schulträger. Ohne Schullizenz kannst du WendApply 7 Tage gratis testen. Danach brauchst du das " + `${SOLO.name} (${SOLO.month} pro Monat oder ${SOLO.year} pro Jahr) oder deine Eltern buchen das ${FAMILY.name} (${FAMILY.priceMonthText} pro Monat oder ${FAMILY.priceYearText} pro Jahr).` },
    { q: "Was kostet WendApply für Schulen?", a: <>Eine Jahreslizenz nach Anzahl Schülerinnen und Schüler: {PACKAGES.map((p) => `${p.name} bis ${p.maxStudents} für CHF ${chf(p.pricePerYear)}`).join(", ")} pro Jahr. Für mehrere Standorte gibt es eine individuelle Offerte. Details unter <Link className={link} href="/preise">Preise</Link>.</> },
    { q: "Kann die Schule monatlich bezahlen?", a: online
      ? `Wir empfehlen den Jahresvertrag. Monatliche Zahlung ist gegen Aufpreis möglich. Die Schuladministration schliesst die Schullizenz im Bereich «Schule» direkt in WendApply ab, mit ${PAYMENT_LABEL.card.title} oder auf ${PAYMENT_LABEL.invoice.title}, oder fragt eine Offerte an.`
      : "Wir empfehlen den Jahresvertrag. Monatliche Zahlung ist gegen Aufpreis möglich. Die Details stehen in der Offerte." },
    { q: "Wie funktioniert der Pilot?", a: <>{PILOT.days} Tage mit {PILOT.classes}, zeitlich begrenzt und mit einem vereinbarten Feedback- und Entscheidungsgespräch am Ende. Ablauf unter <Link className={link} href="/pilot">Pilot</Link>.</> },
    { q: "Wie buchen wir eine Demo?", a: <>Mit einer kurzen E-Mail an <a className={link} href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("WendApply: Demo buchen")}`}>{CONTACT_EMAIL}</a>. Wir zeigen WendApply live aus Sicht der Schülerinnen und Schüler und der Lehrpersonen.</> },
    { q: "Sehen Mitschülerinnen und Mitschüler meine Bewerbungen?", a: "Nein. Klassenziele und Klassendorf zeigen keine vertraulichen Bewerbungsdetails. Lehrpersonen sehen nur, was du für die Klasse freigibst." },
  ] },
  { id: "familien", title: "Familien und Eltern", items: [
    { q: "Gibt es WendApply auch für Familien?", a: <>Ja. Das {FAMILY.name} für 1 Elternteil und 1 Kind kostet {FAMILY.priceMonthText} pro Monat oder {FAMILY.priceYearText} pro Jahr. Ein Elternteil bucht es, dann gilt es auch für das Kind. Mehr unter <Link className={link} href="/familien">Für Familien</Link>.</> },
    { q: "Was sehen Eltern?", a: "Nur das, was das Kind freigibt: standardmässig Fortschritt und Dorf, die Bewerbungsliste nur auf Wunsch. Notizen und Dokumente bleiben privat. Das Kind kann das Teilen jederzeit beenden." },
    { q: "Braucht es eine Einwilligung der Eltern?", a: "Für Kinder unter 16 ja, bevor etwas mit dem Elternkonto geteilt wird. Die App selbst kann das Kind auch ohne Einwilligung nutzen." },
  ] },
  { id: "datenschutz", title: "Datenschutz", items: [
    { q: "Wer sieht meine Daten?", a: "Nur du. Lehrpersonen sehen ausschliesslich, was du bei der Klasse freigibst. Mehr dazu in der Datenschutzerklärung." },
    { q: "Kann ich mein Konto löschen?", a: "Ja. In den Einstellungen findest du «Konto löschen». Dein Konto und alle Daten werden damit entfernt." },
    { q: "Wo finde ich die Datenschutzerklärung?", a: <><Link className={link} href="/datenschutz-uebersicht">Datenschutz im Überblick</Link>, <Link className={link} href="/datenschutz">Datenschutzerklärung</Link>, <Link className={link} href="/datenschutz-jugend">Datenschutz einfach erklärt</Link> und <Link className={link} href="/datenschutz-schulen">Datenschutz für Schulen</Link>.</> },
  ] },
  { id: "login", title: "Probleme bei der Anmeldung", items: [
    { q: "Ich habe mein Passwort vergessen.", a: "Auf der Anmeldeseite «Passwort vergessen» wählen und die E-Mail-Adresse eingeben. Du erhältst einen Link zum Zurücksetzen. Schau auch im Spam-Ordner nach." },
    { q: "Die Bestätigungs-E-Mail kommt nicht an.", a: "Prüfe den Spam-Ordner und ob du die Adresse richtig geschrieben hast. Warte ein paar Minuten und versuche es dann erneut. Schulische Mailfilter blockieren manchmal Nachrichten, dann hilft eine private Adresse." },
    { q: "Die Anmeldung mit Google funktioniert nicht.", a: "Erlaube Pop-ups für diese Seite und versuche es in einem normalen Browserfenster statt im privaten Modus. Alternativ kannst du dich mit E-Mail und Passwort anmelden." },
    { q: "Es hilft nichts.", a: <>Schreib uns an <a className={link} href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> und nenne kurz, was passiert und welches Gerät und welchen Browser du nutzt. Bitte sende nie dein Passwort.</> },
  ] },
];

export default function HilfePage() {
  return (
    <TextPage title={<>Häufige <span className="marker">Fragen</span></>} intro="Antworten auf die wichtigsten Fragen. Nichts gefunden? Dann schreib uns über die Seite Kontakt.">
      <JsonLd data={publicBreadcrumb("/hilfe")} />
      <JsonLd data={faqJsonLd(groups.flatMap((g) => g.items))} />
      <p className="panel-flat px-4 py-3.5 text-[15px]">Neu hier? Die <Link className={link} href="/anleitung">Schritt-für-Schritt-Anleitung</Link> erklärt alle Funktionen und wie du WendApply als App installierst.</p>
      <nav aria-label="Themen" className="flex flex-wrap gap-2">
        {groups.map((g) => <a key={g.id} href={`#${g.id}`} className="inline-flex min-h-10 items-center rounded-full border-[length:var(--border-w)] border-[var(--outline)] bg-[var(--surface)] px-3.5 text-[13px] font-semibold hover:bg-[var(--sun)] hover:text-[var(--on-sun)] pointer-coarse:min-h-11">{g.title.replace("Erste Schritte für ", "Start: ").replace("Schulen, Preise und Pilot", "Schulen und Preise")}</a>)}
      </nav>
      {groups.map((g) => (
        <section key={g.id} id={g.id} aria-labelledby={`${g.id}-h`} className="scroll-mt-24">
          <h2 id={`${g.id}-h`} className="text-heading mb-3">{g.title}</h2>
          <Faq items={g.items} />
        </section>
      ))}
      <p className="text-small text-muted">Weiterhin Fragen? <Link className="underline underline-offset-4" href="/kontakt">Kontakt</Link></p>
    </TextPage>
  );
}
