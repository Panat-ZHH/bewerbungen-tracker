import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BadgeCheck, Mail, Timer, Users } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { CONTACT_EMAIL, PublicShell, Section } from "@/components/public/public-shell";

const title = "WendApply für Schulen: Lehrstellensuche begleiten, kostenloser Pilot";
const description = "So begleiten Lehrpersonen ihre Klassen bei der Lehrstellensuche mit WendApply: Überblick ohne Mehraufwand, Freigabe durch die Schülerinnen und Schüler, Datenschutz für Schulen, kostenloser Pilot.";
export const metadata: Metadata = {
  title, description, alternates: { canonical: "/schulen" },
  openGraph: { title, description, type: "website", locale: "de_CH", siteName: "WendApply" },
};

const benefits = [
  { title: "Überblick ohne Mehraufwand", text: "Sie sehen, wer sich bewirbt, wer Gespräche hat und wer Unterstützung braucht, ohne Listen nachzuführen." },
  { title: "Schülerinnen und Schüler entscheiden", text: "Beim Beitritt zur Klasse sehen die Jugendlichen genau, was Sie sehen. Es zählen nur freigegebene Angaben." },
  { title: "Gesprächsgrundlage statt Nachfragen", text: "Im Einzelgespräch liegt der aktuelle Stand schon vor. Die Zeit gehört der Beratung." },
  { title: "Für Klassen jeder Grösse", text: "Eine Klasse ist in Minuten erstellt. Einladung per Link, Code oder QR-Code." },
];

const steps = [
  "Konto als Lehrperson erstellen und Rolle «Lehrperson» wählen (2 Minuten).",
  "Klasse anlegen und Einladungslink, Code oder QR-Code erzeugen (1 Minute).",
  "Einladung im Unterricht zeigen. Die Jugendlichen treten bei und wählen, was sie teilen (5 Minuten).",
  "Übersicht öffnen: Stand der Klasse, Fristen und wer Unterstützung braucht (ab sofort).",
];

export default function SchulenPage() {
  return (
    <PublicShell>
      <section aria-labelledby="schulen-h" className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-20">
        <p className="text-eyebrow">Für Schulen</p>
        <h1 id="schulen-h" className="text-display mt-4 max-w-3xl">Die Lehrstellensuche Ihrer Klasse <span className="text-gradient">begleiten, ohne zu kontrollieren.</span></h1>
        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted">WendApply hilft Schülerinnen und Schülern, ihre Bewerbungen zu ordnen, und gibt Lehrpersonen einen Überblick über das, was die Jugendlichen freiwillig teilen.</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <ButtonLink href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("WendApply-Pilot für unsere Schule")}`} size="lg" icon={<Mail size={18} aria-hidden />}>Pilot anfragen</ButtonLink>
          <ButtonLink href="/login" size="lg" variant="secondary">Als Lehrperson starten</ButtonLink>
        </div>
      </section>

      <Section id="vorteile" eyebrow="Vorteile" title="Was Lehrpersonen davon haben" tint>
        <ul className="grid gap-4 sm:grid-cols-2">
          {benefits.map((b) => (
            <li key={b.title} className="panel p-6"><h3 className="text-heading flex items-center gap-2"><BadgeCheck size={20} aria-hidden className="shrink-0 text-[var(--brand)]" />{b.title}</h3><p className="text-body mt-2 text-muted">{b.text}</p></li>
          ))}
        </ul>
      </Section>

      <Section id="in-10-minuten" eyebrow="Einstieg" title="So funktioniert es in 10 Minuten">
        <ol className="max-w-2xl space-y-3">
          {steps.map((s, i) => (
            <li key={s} className="panel flex items-start gap-4 p-4">
              <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--brand-soft)] text-sm font-bold text-[var(--brand)]">{i + 1}</span>
              <span className="text-body pt-0.5">{s}</span>
            </li>
          ))}
        </ol>
        <p className="text-small mt-4 flex items-center gap-2 text-muted"><Timer size={16} aria-hidden /> Es ist keine Installation nötig. WendApply läuft im Browser, auch auf dem Handy.</p>
      </Section>

      <Section id="datenschutz" eyebrow="Datenschutz" title="Datenschutz in Kürze" intro="Die vollständigen Informationen, inklusive Vorlage für die Auftragsbearbeitung, finden Sie auf der Seite «Datenschutz für Schulen»." tint>
        <ul className="max-w-3xl list-disc space-y-2 pl-5 text-body text-muted marker:text-[var(--brand)]">
          <li>Lehrpersonen sehen nur, was Schülerinnen und Schüler ausdrücklich freigeben. Die Freigabe ist jederzeit widerrufbar.</li>
          <li>Jugendliche können ihr Konto und alle Daten selbst löschen.</li>
          <li>Wir erheben nur, was für die Lehrstellensuche nötig ist. Keine Werbung, kein Verkauf von Daten.</li>
          <li>Verantwortlich ist Wendico, Kleinandelfingen (Schweiz).</li>
        </ul>
        <div className="mt-6 flex flex-wrap gap-3">
          <ButtonLink href="/datenschutz-schulen" variant="secondary" icon={<ArrowRight size={16} aria-hidden />}>Datenschutz für Schulen</ButtonLink>
          <ButtonLink href="/datenschutz" variant="ghost">Datenschutzerklärung</ButtonLink>
          <ButtonLink href="/datenschutz-jugend" variant="ghost">Für Jugendliche erklärt</ButtonLink>
        </div>
      </Section>

      <Section id="pilot" eyebrow="Pilot" title="Kostenloser Pilot für Ihre Schule">
        <div className="panel max-w-3xl p-6 sm:p-8">
          <p className="flex items-center gap-2 text-heading"><Users size={20} aria-hidden className="text-[var(--brand)]" /> 1 bis 3 Klassen, ein Semester, kostenlos</p>
          <p className="text-body mt-3 text-muted">Wir starten gemeinsam mit einer oder mehreren Klassen und holen Ihr Feedback ein. Sie erhalten persönliche Unterstützung beim Einstieg. Im Pilot entstehen keine Kosten und keine Verpflichtungen.</p>
          <p className="text-body mt-4">Schreiben Sie uns kurz, an welcher Schule und in welcher Stufe Sie unterrichten: <a className="font-semibold text-[var(--brand)] underline underline-offset-4" href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("WendApply-Pilot für unsere Schule")}`}>{CONTACT_EMAIL}</a></p>
          <p className="text-small mt-4 text-muted">Weitere Wege zu uns: <Link className="underline underline-offset-4" href="/kontakt">Kontakt</Link> · Fragen vorab: <Link className="underline underline-offset-4" href="/hilfe">Hilfe</Link></p>
        </div>
      </Section>
    </PublicShell>
  );
}
