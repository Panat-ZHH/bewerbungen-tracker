import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BadgeCheck, Mail, Timer } from "lucide-react";
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

const link = "font-semibold text-[var(--brand)] underline decoration-2 underline-offset-4 hover:text-[var(--brand-strong)]";

export default function SchulenPage() {
  return (
    <PublicShell>
      <section aria-labelledby="schulen-h" className="mx-auto w-full max-w-6xl px-4 pb-14 pt-10 sm:px-6 sm:pb-20 sm:pt-16">
        <h1 id="schulen-h" className="animate-rise text-hero max-w-4xl">Die Lehrstellensuche Ihrer Klasse begleiten, <span className="marker [box-decoration-break:clone]">ohne zu kontrollieren.</span></h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted">WendApply hilft Schülerinnen und Schülern, ihre Bewerbungen zu ordnen, und gibt Lehrpersonen einen Überblick über das, was die Jugendlichen freiwillig teilen.</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <ButtonLink href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("WendApply-Pilot für unsere Schule")}`} size="lg" icon={<Mail size={18} strokeWidth={2.2} aria-hidden />}>Pilot anfragen</ButtonLink>
          <ButtonLink href="/login" size="lg" variant="secondary">Als Lehrperson starten</ButtonLink>
        </div>
      </section>

      <Section id="vorteile" title="Was Lehrpersonen davon haben" tint>
        <ul className="grid gap-x-12 sm:grid-cols-2">
          {benefits.map((b) => (
            <li key={b.title} className="border-t-2 border-dashed border-[var(--line)] py-5"><h3 className="text-heading flex items-start gap-2.5"><BadgeCheck size={22} strokeWidth={2.2} aria-hidden className="mt-0.5 shrink-0 text-[var(--brand)]" />{b.title}</h3><p className="text-body mt-2 pl-8 text-muted">{b.text}</p></li>
          ))}
        </ul>
      </Section>

      <Section id="in-10-minuten" title={<>So funktioniert es in <span className="marker">10 Minuten</span></>}>
        <ol className="rows max-w-2xl">
          {steps.map((s, i) => (
            <li key={s} className="flex items-start gap-5 py-4">
              <span aria-hidden className="num-big w-8 shrink-0 text-[var(--brand)]">{i + 1}</span>
              <span className="pt-1 text-base">{s}</span>
            </li>
          ))}
        </ol>
        <p className="text-small mt-5 flex items-center gap-2 text-muted"><Timer size={16} aria-hidden /> Es ist keine Installation nötig. WendApply läuft im Browser, auch auf dem Handy.</p>
      </Section>

      <Section id="datenschutz" title="Datenschutz in Kürze" intro="Die vollständigen Informationen, inklusive Vorlage für die Auftragsbearbeitung, finden Sie auf der Seite «Datenschutz für Schulen»." tint>
        <ul className="max-w-3xl list-disc space-y-2 pl-5 text-base text-[var(--ink)] marker:text-[var(--brand)]">
          <li>Lehrpersonen sehen nur, was Schülerinnen und Schüler ausdrücklich freigeben. Die Freigabe ist jederzeit widerrufbar.</li>
          <li>Jugendliche können ihr Konto und alle Daten selbst löschen.</li>
          <li>Wir erheben nur, was für die Lehrstellensuche nötig ist. Keine Werbung, kein Verkauf von Daten.</li>
          <li>Verantwortlich ist Wendico, Kleinandelfingen (Schweiz).</li>
        </ul>
        <div className="mt-7 flex flex-wrap items-center gap-3">
          <ButtonLink href="/datenschutz-schulen" variant="secondary" icon={<ArrowRight size={16} strokeWidth={2.4} aria-hidden />}>Datenschutz für Schulen</ButtonLink>
          <ButtonLink href="/datenschutz" variant="ghost">Datenschutzerklärung</ButtonLink>
          <ButtonLink href="/datenschutz-jugend" variant="ghost">Für Jugendliche erklärt</ButtonLink>
        </div>
      </Section>

      <Section id="pilot" title="Kostenloser Pilot für Ihre Schule">
        <div className="panel relative max-w-3xl p-6 shadow-[var(--shadow-lg)] sm:p-8">
          <span className="sticker tilt-r absolute -top-3.5 right-4 text-sm sm:right-8">kostenlos</span>
          <p className="font-display text-2xl font-extrabold leading-tight tracking-[-.02em] sm:text-3xl">1 bis 3 Klassen, ein Semester, kostenlos</p>
          <p className="text-body mt-3 text-muted">Wir starten gemeinsam mit einer oder mehreren Klassen und holen Ihr Feedback ein. Sie erhalten persönliche Unterstützung beim Einstieg. Im Pilot entstehen keine Kosten und keine Verpflichtungen.</p>
          <p className="text-body mt-4">Schreiben Sie uns kurz, an welcher Schule und in welcher Stufe Sie unterrichten: <a className={`${link} break-all`} href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("WendApply-Pilot für unsere Schule")}`}>{CONTACT_EMAIL}</a></p>
          <p className="text-small mt-4 text-muted">Weitere Wege zu uns: <Link className="underline underline-offset-4" href="/kontakt">Kontakt</Link> · Fragen vorab: <Link className="underline underline-offset-4" href="/hilfe">Hilfe</Link></p>
        </div>
      </Section>
    </PublicShell>
  );
}
