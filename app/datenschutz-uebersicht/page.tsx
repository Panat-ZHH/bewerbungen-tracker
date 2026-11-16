import type { Metadata } from "next";
import { publicMetadata, publicBreadcrumb } from "@/lib/seo/pages";
import { JsonLd } from "@/components/seo/json-ld";
import Link from "next/link";
import { Check, X } from "lucide-react";
import { PublicShell } from "@/components/public/public-shell";
import { CONTACT_EMAIL } from "@/components/public/marketing";


export const metadata: Metadata = publicMetadata({ canonical: "/datenschutz-uebersicht" });

const link = "font-semibold text-[var(--brand)] underline decoration-2 underline-offset-4 hover:text-[var(--brand-strong)]";

type Row = { what: string; student: boolean | string; teacher: boolean | string; classmates: boolean | string };

/** What each role can see. Mirrors docs/legal/datenschutz-schulen.md §4 and the RLS policies; change both together. */
const visibility: Row[] = [
  { what: "Anzeigename und Klassenzugehörigkeit", student: true, teacher: true, classmates: false },
  { what: "Anzahl Bewerbungen", student: true, teacher: "wenn freigegeben", classmates: false },
  { what: "Status der Bewerbungen (z. B. Gespräch, Zusage)", student: true, teacher: "wenn freigegeben", classmates: false },
  { what: "Firmennamen", student: true, teacher: "wenn freigegeben", classmates: false },
  { what: "Notizen, Ansprechpersonen, Lohnangaben", student: true, teacher: false, classmates: false },
  { what: "Lebenslauf, Motivationsschreiben, Dokumente", student: true, teacher: false, classmates: false },
  { what: "KI-Bewerbungs-Check und Ergebnisse", student: true, teacher: false, classmates: false },
  { what: "Gemeinsame Klassenziele und Klassendorf (ohne Bewerbungsdetails)", student: true, teacher: true, classmates: true },
];

function Cell({ v }: { v: boolean | string }) {
  if (v === true) return <span className="inline-flex items-center gap-1.5 font-semibold text-[var(--success-fg)]"><Check size={18} strokeWidth={3} aria-hidden />Ja</span>;
  if (v === false) return <span className="inline-flex items-center gap-1.5 text-muted"><X size={18} strokeWidth={3} aria-hidden />Nein</span>;
  return <span className="text-[14px]">{v}</span>;
}

const roles = [
  { title: "Schülerin oder Schüler", text: "Führt die eigenen Bewerbungen selbst. Entscheidet beim Klassenbeitritt mit drei Schaltern, was die Lehrperson sieht, und kann das jederzeit ändern. Kann das Konto selbst löschen und die eigenen Daten herunterladen." },
  { title: "Lehrperson", text: "Erstellt Klassen, lädt ein, setzt Fristen und Klassenziele und sieht nur, was die Jugendlichen freigeben. Notizen, Unterlagen und KI-Ergebnisse sieht sie nie." },
  { title: "Schuladministration", text: "Verwaltet Lehrpersonen, Klassen und die Lizenz der Schule und sieht zusammengefasste Zahlen. Vertrauliche Bewerbungsdetails einzelner Jugendlicher sieht sie nicht." },
];

const docs = [
  { href: "/datenschutz", title: "Datenschutzerklärung", text: "Die vollständige Erklärung für alle Nutzenden." },
  { href: "/datenschutz-jugend", title: "Datenschutz für Jugendliche", text: "Die Kurzfassung in einfacher Sprache, auch für Eltern geeignet." },
  { href: "/datenschutz-schulen", title: "Datenschutz für Schulen", text: "Rollen, Rechtsrahmen, Zugriffe und Massnahmen." },
  { href: "/avv", title: "AVV-Vorlage", text: "Vorlage für die Vereinbarung zur Auftragsbearbeitung." },
  { href: "/loeschkonzept", title: "Löschkonzept", text: "Was am Klassenende mit welchen Daten passiert." },
  { href: "/hosting", title: "Hosting", text: "Wo die Daten liegen und welche Dienstleister beteiligt sind." },
];

export default function DatenschutzUebersichtPage() {
  return (
    <PublicShell>
      <JsonLd data={publicBreadcrumb("/datenschutz-uebersicht")} />
      <article className="mx-auto w-full max-w-4xl px-4 py-12 sm:px-6 sm:py-16">
        <h1 className="text-display">Datenschutz <span className="marker">im Überblick</span></h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted">WendApply arbeitet mit Daten von Jugendlichen. Diese Seite fasst für Schulen, Schülerinnen und Schüler und Erziehungsberechtigte zusammen, wer was sieht und wie wir mit den Daten umgehen. Verbindlich sind die verlinkten Dokumente.</p>

        <nav aria-label="Inhalt dieser Seite" className="mt-6 flex flex-wrap gap-2">
          {[["rollen", "Rollen"], ["sichtbarkeit", "Wer sieht was?"], ["grundsaetze", "Grundsätze"], ["loeschung", "Löschung und Export"], ["hosting", "Hosting und Sicherheit"], ["recht", "Rechtsrahmen"], ["dokumente", "Dokumente"]].map(([id, label]) => (
            <a key={id} href={`#${id}`} className="inline-flex min-h-10 items-center rounded-full border-[length:var(--border-w)] border-[var(--outline)] bg-[var(--surface)] px-3.5 text-[13px] font-semibold hover:bg-[var(--sun)] hover:text-[var(--on-sun)] pointer-coarse:min-h-11">{label}</a>
          ))}
        </nav>

        <div className="mt-10 space-y-12 text-[15px] leading-relaxed">
          <section id="rollen" aria-labelledby="rollen-h" className="scroll-mt-24">
            <h2 id="rollen-h" className="text-title">Rollen</h2>
            <ul className="mt-5 grid gap-4 md:grid-cols-3">
              {roles.map((r) => <li key={r.title} className="panel-flat p-5"><h3 className="text-heading">{r.title}</h3><p className="mt-2 text-muted">{r.text}</p></li>)}
            </ul>
          </section>

          <section id="sichtbarkeit" aria-labelledby="sichtbarkeit-h" className="scroll-mt-24">
            <h2 id="sichtbarkeit-h" className="text-title">Wer sieht was?</h2>
            <p className="mt-3 text-muted">Die Freigaben steuern die Schülerinnen und Schüler selbst. Die Regeln gelten direkt in der Datenbank (Zugriffsschutz pro Zeile), nicht nur in der Oberfläche.</p>
            <div className="panel-flat mt-5 overflow-x-auto" tabIndex={0} role="region" aria-label="Tabelle: Wer sieht was">
              <table className="w-full min-w-[36rem] border-collapse text-left">
                <caption className="sr-only">Sichtbarkeit von Daten nach Rolle</caption>
                <thead>
                  <tr className="border-b-[length:var(--border-w)] border-[var(--outline)] bg-[var(--surface-2)]">
                    <th scope="col" className="px-4 py-3 font-semibold">Daten</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Schüler/in selbst</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Lehrperson</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Mitschüler/innen</th>
                  </tr>
                </thead>
                <tbody>
                  {visibility.map((r) => (
                    <tr key={r.what} className="border-t-2 border-dashed border-[var(--line)] first:border-t-0">
                      <th scope="row" className="px-4 py-3 font-medium">{r.what}</th>
                      <td className="px-4 py-3"><Cell v={r.student} /></td>
                      <td className="px-4 py-3"><Cell v={r.teacher} /></td>
                      <td className="px-4 py-3"><Cell v={r.classmates} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-small mt-3 text-muted">Freunde sehen nur, was Jugendliche in den Freundes-Einstellungen freigeben, nie Notizen oder Dokumente.</p>
          </section>

          <section id="grundsaetze" aria-labelledby="grundsaetze-h" className="scroll-mt-24">
            <h2 id="grundsaetze-h" className="text-title">Grundsätze</h2>
            <ul className="mt-4 list-disc space-y-2 pl-5 marker:text-[var(--brand)]">
              <li><strong>Datenminimierung:</strong> Nötig sind nur E-Mail-Adresse, Passwort (oder Google-Anmeldung) und ein Anzeigename. Alle weiteren Angaben sind freiwillig.</li>
              <li><strong>Getrennte Bereiche:</strong> Private Bewerbungsdaten und die Gamification (Dorf, Punkte, Klassenziele) sind getrennt. Das Klassendorf zeigt keine vertraulichen Bewerbungsdetails.</li>
              <li><strong>Motivation statt Wettbewerb:</strong> Belohnt werden sinnvolle Fortschritte, nicht möglichst viele Bewerbungen.</li>
              <li><strong>Keine Werbung:</strong> Keine Werbe- oder Analyse-Tracker, kein Verkauf von Daten.</li>
              <li><strong>Transparenz:</strong> Vor dem Klassenbeitritt zeigt WendApply genau, was die Lehrperson sehen wird.</li>
            </ul>
          </section>

          <section id="loeschung" aria-labelledby="loeschung-h" className="scroll-mt-24">
            <h2 id="loeschung-h" className="text-title">Löschung, Aufbewahrung und Export</h2>
            <ul className="mt-4 list-disc space-y-2 pl-5 marker:text-[var(--brand)]">
              <li>Schülerinnen und Schüler können ihr Konto in den Einstellungen jederzeit selbst und vollständig löschen.</li>
              <li>Unter «Daten sichern» laden sie vorher eine Kopie ihrer Bewerbungen herunter.</li>
              <li>Am Klassenende archiviert oder löscht die Lehrperson die Klasse. Die persönlichen Konten der Jugendlichen bleiben bestehen, bis sie selbst entscheiden.</li>
              <li>Details und Fristen stehen im <Link className={link} href="/loeschkonzept">Löschkonzept</Link>.</li>
            </ul>
          </section>

          <section id="hosting" aria-labelledby="hosting-h" className="scroll-mt-24">
            <h2 id="hosting-h" className="text-title">Hosting und Sicherheit</h2>
            <ul className="mt-4 list-disc space-y-2 pl-5 marker:text-[var(--brand)]">
              <li>Datenbank und Dateien liegen in der EU (Irland). Die Webseite wird über einen Anbieter aus den USA ausgeliefert. Alle Dienstleister stehen auf der Seite <Link className={link} href="/hosting">Hosting</Link>.</li>
              <li>Die Übertragung ist verschlüsselt (HTTPS/TLS), Passwörter werden nur als Hash gespeichert.</li>
              <li>Zugriffsregeln pro Zeile in der Datenbank trennen Schulen, Klassen und Personen.</li>
              <li>Sicherheitsvorfälle melden wir der Schule unverzüglich. Auskunfts- und Löschbegehren beantworten wir über <a className={link} href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.</li>
            </ul>
          </section>

          <section id="recht" aria-labelledby="recht-h" className="scroll-mt-24">
            <h2 id="recht-h" className="text-title">Rechtsrahmen</h2>
            <p className="mt-3">In der Schweiz gelten das Datenschutzgesetz (DSG) und für öffentliche Schulen das kantonale Datenschutzrecht. Für Schulen in Deutschland und Österreich gilt die DSGVO. Die Schule entscheidet über den Einsatz und schliesst mit uns eine Vereinbarung zur Auftragsbearbeitung (<Link className={link} href="/avv">AVV-Vorlage</Link>).</p>
            <p className="text-small mt-3 text-muted">Die Dokumente sind Entwürfe und werden rechtlich geprüft. Zertifizierungen haben wir keine; unsere Dienstleister haben eigene, siehe Hosting.</p>
          </section>

          <section id="dokumente" aria-labelledby="dokumente-h" className="scroll-mt-24">
            <h2 id="dokumente-h" className="text-title">Alle Dokumente</h2>
            <ul className="mt-5 grid gap-3 sm:grid-cols-2">
              {docs.map((d) => (
                <li key={d.href}><Link href={d.href} className="panel card-interactive block h-full p-4"><span className="text-heading block">{d.title}</span><span className="mt-1 block text-muted">{d.text}</span></Link></li>
              ))}
            </ul>
          </section>
        </div>
      </article>
    </PublicShell>
  );
}
