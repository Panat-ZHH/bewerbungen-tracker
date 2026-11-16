import type { Metadata } from "next";
import { publicMetadata, publicBreadcrumb } from "@/lib/seo/pages";
import { JsonLd } from "@/components/seo/json-ld";
import Link from "next/link";
import { ArrowRight, Check, Mail, Presentation } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { PublicShell, Section } from "@/components/public/public-shell";
import { CtaBand } from "@/components/public/cta-band";
import { MAIL, PILOT } from "@/components/public/marketing";


export const metadata: Metadata = publicMetadata({ canonical: "/pilot" });

const steps = [
  { title: "Kennenlernen und Demo", text: "Wir zeigen WendApply live aus Sicht der Schülerinnen und Schüler und der Lehrpersonen und klären Ihre Fragen, auch zum Datenschutz." },
  { title: "Pilot vereinbaren", text: `Wir legen Klassen (${PILOT.classes}), Start- und Enddatum, Ansprechpersonen und den Termin für das Abschlussgespräch gemeinsam fest.` },
  { title: "Start in der Klasse", text: "Die Lehrperson erstellt die Klasse und lädt per Link, Code oder QR-Code ein. Die Jugendlichen entscheiden beim Beitritt, was sie teilen." },
  { title: `${PILOT.days} Tage nutzen`, text: "Die Klasse arbeitet mit WendApply im Berufswahlunterricht. Wir sind bei Fragen erreichbar und holen zwischendurch kurz Rückmeldungen ein." },
  { title: "Feedback und Entscheidung", text: "Im vereinbarten Gespräch schauen wir Nutzung, Rückmeldungen und Mehrwert gemeinsam an. Danach entscheiden Sie über die Jahreslizenz." },
];

const gets = [
  "Zugang für Lehrpersonen und Schülerinnen und Schüler der Pilotklassen",
  "Begleiteter Start: kurze Einführung für die beteiligten Lehrpersonen",
  "Vorlage für die Information an Schülerinnen, Schüler und Eltern",
  "Datenschutz-Unterlagen für die Schulleitung, inklusive AVV-Vorlage",
  "Kurze Auswertung von Nutzung und Rückmeldungen für das Abschlussgespräch",
  "Ansprechperson bei Wendico während des ganzen Pilots",
];

const link = "font-semibold text-[var(--brand)] underline decoration-2 underline-offset-4 hover:text-[var(--brand-strong)]";

export default function PilotPage() {
  return (
    <PublicShell>
      <JsonLd data={publicBreadcrumb("/pilot")} />
      <section aria-labelledby="pilot-h" className="mx-auto w-full max-w-6xl px-4 pb-14 pt-10 sm:px-6 sm:pb-20 sm:pt-16">
        <p className="sticker sticker-mint tilt-l mb-5 text-sm">{PILOT.days} Tage · {PILOT.classes}</p>
        <h1 id="pilot-h" className="animate-rise text-hero max-w-4xl hyphens-auto break-words">Testen Sie WendApply <span className="marker [box-decoration-break:clone]">im echten Unterricht.</span></h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted">Der Pilot ist zeitlich begrenzt auf {PILOT.days} Tage, läuft mit {PILOT.classes} und endet mit einem vereinbarten Feedback- und Entscheidungsgespräch.{PILOT.free ? " Für den Pilot entstehen der Schule keine Lizenzkosten." : ""}</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <ButtonLink href={MAIL.pilot} size="lg" icon={<Mail size={18} strokeWidth={2.2} aria-hidden />}>Pilot anfragen</ButtonLink>
          <ButtonLink href={MAIL.demo} size="lg" variant="secondary" icon={<Presentation size={18} strokeWidth={2.2} aria-hidden />}>Zuerst eine Demo</ButtonLink>
        </div>
      </section>

      <Section id="ablauf" title={<>So läuft der <span className="marker">Pilot</span></>} intro="Vom ersten Gespräch bis zur Entscheidung in fünf Schritten." tint>
        <ol className="rows max-w-3xl">
          {steps.map((s, i) => (
            <li key={s.title} className="flex items-start gap-5 py-5">
              <span aria-hidden className="num-big w-8 shrink-0 text-[var(--brand)]">{i + 1}</span>
              <div><h3 className="text-heading">{s.title}</h3><p className="text-body mt-1 text-muted">{s.text}</p></div>
            </li>
          ))}
        </ol>
      </Section>

      <Section id="leistungen" title="Was Ihre Schule im Pilot bekommt">
        <ul className="grid max-w-4xl gap-x-10 gap-y-3 sm:grid-cols-2">
          {gets.map((g) => <li key={g} className="flex gap-3 text-[15px] leading-relaxed"><Check size={20} strokeWidth={2.8} aria-hidden className="mt-0.5 shrink-0 text-[var(--brand)]" />{g}</li>)}
        </ul>
      </Section>

      <Section id="voraussetzungen" title="Was wir von Ihnen brauchen" tint>
        <ul className="max-w-3xl list-disc space-y-2 pl-5 text-base marker:text-[var(--brand)]">
          <li>Eine Lehrperson pro Pilotklasse, die WendApply im Berufswahlunterricht einsetzt.</li>
          <li>Eine Ansprechperson der Schulleitung für Datenschutz und Entscheidung.</li>
          <li>Information der Schülerinnen, Schüler und Eltern vor dem Start (Vorlage von uns).</li>
          <li>Zeit für das gemeinsame Feedback- und Entscheidungsgespräch am Ende des Pilots.</li>
        </ul>
        <p className="text-small mt-6 text-muted">Nach dem Pilot gibt es keine automatische Verlängerung. Die Preise der Jahreslizenz finden Sie unter <Link className={link} href="/preise">Preise</Link>, Datenschutz-Informationen unter <Link className={link} href="/datenschutz-uebersicht">Datenschutz im Überblick</Link>.</p>
      </Section>

      <CtaBand title="Bereit für den Pilot?" text="Schreiben Sie uns kurz Schule, Stufe und gewünschten Start. Wir melden uns in der Regel innert weniger Werktage.">
        <ButtonLink href={MAIL.pilot} size="lg" icon={<Mail size={18} strokeWidth={2.2} aria-hidden />}>Pilot anfragen</ButtonLink>
        <ButtonLink href="/schulen" size="lg" variant="secondary" className="!border-[var(--outline-fill)]" icon={<ArrowRight size={18} strokeWidth={2.4} aria-hidden />}>Mehr für Schulen</ButtonLink>
      </CtaBand>
    </PublicShell>
  );
}
