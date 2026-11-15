import type { Metadata } from "next";
import Link from "next/link";
import { Faq, type FaqItem } from "@/components/public/faq";
import { CONTACT_EMAIL, TextPage } from "@/components/public/public-shell";

export const metadata: Metadata = {
  title: "Hilfe und häufige Fragen",
  description: "Antworten zu WendApply: Erste Schritte für Schülerinnen, Schüler und Lehrpersonen, Datenschutz und Probleme beim Login.",
  alternates: { canonical: "/hilfe" },
  openGraph: { title: "Hilfe und häufige Fragen | WendApply", type: "website", locale: "de_CH", siteName: "WendApply" },
};

const link = "font-medium text-[var(--brand)] underline underline-offset-4";

const groups: { id: string; title: string; items: FaqItem[] }[] = [
  { id: "schueler", title: "Erste Schritte für Schülerinnen und Schüler", items: [
    { q: "Wie starte ich?", a: <>Auf <Link className={link} href="/login">Loslegen</Link> ein Konto erstellen und «Schüler:in» wählen. Danach kannst du Stellen suchen und deine erste Bewerbung eintragen.</> },
    { q: "Wie trage ich eine Bewerbung ein?", a: "Im Bereich «Bewerbungen» auf «Bewerbung hinzufügen» tippen, Betrieb und Stelle eingeben, Status und Frist festlegen. Du kannst jederzeit Notizen ergänzen und den Status ändern." },
    { q: "Wie trete ich der Klasse bei?", a: "Deine Lehrperson gibt dir einen Link, einen Code oder einen QR-Code. Öffne den Link oder gib den Code im Bereich «Klassen» ein. Vor dem Beitritt siehst du genau, was die Lehrperson sehen wird." },
    { q: "Was ist der Bewerbungs-Check?", a: <>Im <Link className={link} href="/bewerbung-check">Bewerbungs-Check</Link> lädst du deinen Brief als PDF oder Word-Datei hoch. Eine KI gibt dir Punkte und Tipps mit Beispielsätzen. Deine Datei wird nicht gespeichert, nur das Ergebnis. Eine KI kann sich irren: Lass deinen Brief auch von einer Lehrperson oder deinen Eltern lesen.</> },
    { q: "Muss ich der Lehrperson alles zeigen?", a: "Nein. Du entscheidest beim Beitritt, was geteilt wird, und kannst das später ändern." },
  ] },
  { id: "lehrperson", title: "Erste Schritte für Lehrpersonen", items: [
    { q: "Wie erstelle ich eine Klasse?", a: <>Konto erstellen, Rolle «Lehrperson» wählen, im Bereich «Klassen» auf «Klasse erstellen» klicken. Danach erzeugen Sie einen Einladungslink, Code oder QR-Code. Mehr unter <Link className={link} href="/schulen">Für Schulen</Link>.</> },
    { q: "Was sehe ich von meinen Schülerinnen und Schülern?", a: "Nur das, was sie ausdrücklich freigeben, zum Beispiel Anzahl und Status der Bewerbungen. Alles andere bleibt privat." },
    { q: "Kostet WendApply etwas?", a: "Für Schülerinnen und Schüler ist WendApply kostenlos. Schulen können es im kostenlosen Pilot testen." },
  ] },
  { id: "datenschutz", title: "Datenschutz", items: [
    { q: "Wer sieht meine Daten?", a: "Nur du. Lehrpersonen sehen ausschliesslich, was du bei der Klasse freigibst. Mehr dazu in der Datenschutzerklärung." },
    { q: "Kann ich mein Konto löschen?", a: "Ja. In den Einstellungen findest du «Konto löschen». Dein Konto und alle Daten werden damit entfernt." },
    { q: "Wo finde ich die Datenschutzerklärung?", a: <><Link className={link} href="/datenschutz">Datenschutzerklärung</Link>, <Link className={link} href="/datenschutz-jugend">Datenschutz einfach erklärt</Link> und <Link className={link} href="/datenschutz-schulen">Datenschutz für Schulen</Link>.</> },
  ] },
  { id: "login", title: "Probleme beim Login", items: [
    { q: "Ich habe mein Passwort vergessen.", a: "Auf der Anmeldeseite «Passwort vergessen» wählen und die E-Mail-Adresse eingeben. Du erhältst einen Link zum Zurücksetzen. Schau auch im Spam-Ordner nach." },
    { q: "Die Bestätigungs-E-Mail kommt nicht an.", a: "Prüfe den Spam-Ordner und ob du die Adresse richtig geschrieben hast. Warte ein paar Minuten und versuche es dann erneut. Schulische Mailfilter blockieren manchmal Nachrichten, dann hilft eine private Adresse." },
    { q: "Die Anmeldung mit Google funktioniert nicht.", a: "Erlaube Pop-ups für diese Seite und versuche es in einem normalen Browserfenster statt im privaten Modus. Alternativ kannst du dich mit E-Mail und Passwort anmelden." },
    { q: "Es hilft nichts.", a: <>Schreib uns an <a className={link} href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> und nenne kurz, was passiert und welches Gerät und welchen Browser du nutzt. Bitte sende nie dein Passwort.</> },
  ] },
];

export default function HilfePage() {
  return (
    <TextPage title={<>Häufige <span className="marker">Fragen</span></>} intro="Antworten auf die wichtigsten Fragen. Nichts gefunden? Dann schreib uns über die Seite Kontakt.">
      <nav aria-label="Themen" className="flex flex-wrap gap-2">
        {groups.map((g) => <a key={g.id} href={`#${g.id}`} className="inline-flex min-h-10 items-center rounded-full border-[length:var(--border-w)] border-[var(--outline)] bg-[var(--surface)] px-3.5 text-[13px] font-semibold hover:bg-[var(--sun)] hover:text-[var(--on-sun)] pointer-coarse:min-h-11">{g.title.replace("Erste Schritte für ", "Start: ")}</a>)}
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
