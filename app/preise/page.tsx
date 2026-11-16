import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Building2, CalendarDays, Check, FileText, Mail, Presentation, School } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { PublicShell, Section } from "@/components/public/public-shell";
import { CtaBand } from "@/components/public/cta-band";
import { Faq, type FaqItem } from "@/components/public/faq";
import { MAIL, PACKAGES, PILOT, chf, perStudentMonth, perStudentYear } from "@/components/public/marketing";

const title = "Preise für Schulen: Jahreslizenz ab CHF 990";
const description = "WendApply für Sekundarschulen: Starter bis 100 Schülerinnen und Schüler CHF 990, Professional bis 300 CHF 1'490, Enterprise bis 800 CHF 3'990 pro Jahr. Für Schülerinnen und Schüler kostenlos.";

export const metadata: Metadata = {
  title, description, alternates: { canonical: "/preise" },
  openGraph: { title: `${title} | WendApply`, description, type: "website", locale: "de_CH", siteName: "WendApply" },
};

const pro = PACKAGES.find((p) => p.recommended)!;
const link = "font-semibold text-[var(--brand)] underline decoration-2 underline-offset-4 hover:text-[var(--brand-strong)]";

const faq: FaqItem[] = [
  { q: "Müssen Schülerinnen und Schüler etwas bezahlen?", a: "Nein. Die Schule (bzw. Gemeinde oder Schulträger) bezahlt die Lizenz. Schülerinnen und Schüler haben kein kostenpflichtiges Konto und müssen nichts kaufen." },
  { q: "Wie wird gezählt?", a: "Massgebend ist die Zahl der Schülerinnen und Schüler, die WendApply an Ihrer Schule nutzen. Lehrpersonen sind in allen Paketen inbegriffen." },
  { q: "Kann die Schule monatlich bezahlen?", a: "Wir empfehlen den Jahresvertrag. Eine monatliche Zahlung ist gegen Aufpreis möglich. Die Details stehen in der Offerte." },
  { q: "Wir haben mehrere Schulhäuser oder sind ein Schulverband.", a: "Für mehrere Standorte und Schulverbände erstellen wir ein individuelles Angebot. Schreiben Sie uns, wie viele Standorte und Schülerinnen und Schüler es sind." },
  { q: "Können wir zuerst testen?", a: <>Ja, mit dem <Link className={link} href="/pilot">30-Tage-Pilot</Link> für 1 bis 2 Klassen. Danach entscheiden Sie in einem gemeinsamen Gespräch über die Jahreslizenz.</> },
  { q: "Kann man online bestellen?", a: "Nein. Sie erhalten eine Offerte und einen Vertrag, wie bei Schulen üblich. Es gibt keinen Online-Kauf und keine Zahlung in der App." },
];

export default function PreisePage() {
  return (
    <PublicShell>
      <section aria-labelledby="preise-h" className="mx-auto w-full max-w-6xl px-4 pb-10 pt-10 sm:px-6 sm:pt-16">
        <p className="sticker sticker-paper tilt-l mb-5 text-sm">Preise für Schulen</p>
        <h1 id="preise-h" className="animate-rise text-hero max-w-4xl hyphens-auto break-words">Eine Lizenz für die ganze Schule. <span className="marker [box-decoration-break:clone]">Für Schüler kostenlos.</span></h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted">Die Schule bezahlt eine Jahreslizenz nach Anzahl Schülerinnen und Schüler. Lehrpersonen sind immer inbegriffen. Im Paket Professional sind das bei {pro.maxStudents} Schülerinnen und Schülern rund CHF {chf(perStudentMonth(pro), 2)} pro Schüler und Monat.</p>
      </section>

      <section aria-label="Pakete" className="mx-auto w-full max-w-6xl px-4 pb-14 sm:px-6 sm:pb-20">
        <ul className="grid gap-6 pt-4 md:grid-cols-3 md:items-stretch">
          {PACKAGES.map((p) => (
            <li key={p.id} className={`panel relative flex flex-col p-6 sm:p-7 ${p.recommended ? "md:-mt-4 shadow-[var(--shadow-lg)] ring-4 ring-[var(--sun)]" : ""}`} aria-labelledby={`pkg-${p.id}`}>
              {p.recommended && <span className="sticker tilt-r absolute -top-3.5 right-5 text-sm">Empfohlen</span>}
              <h2 id={`pkg-${p.id}`} className="text-title !text-[1.75rem]">{p.name}</h2>
              <p className="text-small mt-1 text-muted">{p.audience}</p>
              <p className="mt-5 flex items-baseline gap-2"><span className="text-sm font-semibold">CHF</span><span className="num-big !text-5xl">{chf(p.pricePerYear)}</span><span className="text-sm text-muted">pro Jahr</span></p>
              <p className="mt-2 text-[15px] font-semibold">bis {p.maxStudents} Schülerinnen und Schüler</p>
              <p className="text-small mt-1 text-muted">entspricht ab CHF {chf(perStudentYear(p), 2)} pro Schüler und Jahr</p>
              <ul className="mt-5 flex-1 space-y-2.5 text-[15px]">
                {p.features.map((f) => <li key={f} className="flex gap-2.5"><Check size={18} strokeWidth={2.8} aria-hidden className="mt-0.5 shrink-0 text-[var(--brand)]" />{f}</li>)}
              </ul>
              <ButtonLink href={MAIL.offer(p.name)} variant={p.recommended ? "primary" : "secondary"} full className="mt-7" icon={<Mail size={16} strokeWidth={2.2} aria-hidden />} aria-label={`Offerte für ${p.name} anfragen (E-Mail)`}>Offerte anfragen</ButtonLink>
            </li>
          ))}
        </ul>

        <div className="panel-flat mt-8 grid gap-5 p-6 sm:grid-cols-[auto_1fr_auto] sm:items-center sm:p-7">
          <Building2 size={32} strokeWidth={2} aria-hidden className="text-[var(--brand)]" />
          <div>
            <h2 className="text-heading">Mehrere Standorte oder Schulverband</h2>
            <p className="text-body mt-1 text-muted">Für Gemeinden, Schulträger und Verbände mit mehreren Schulhäusern erstellen wir ein individuelles Angebot.</p>
          </div>
          <ButtonLink href={MAIL.multi} variant="secondary" icon={<Mail size={16} strokeWidth={2.2} aria-hidden />}>Individuelles Angebot</ButtonLink>
        </div>
      </section>

      <Section id="konditionen" title="Gut zu wissen" tint>
        <ul className="grid gap-x-12 sm:grid-cols-2">
          {[
            [School, "Schüler bezahlen nichts", "Die Lizenz bezahlt die Schule, die Gemeinde oder der Schulträger. Für Schülerinnen und Schüler gibt es kein kostenpflichtiges Konto."],
            [CalendarDays, "Jahresvertrag", "Wir empfehlen den Jahresvertrag. Monatliche Zahlung ist gegen Aufpreis möglich."],
            [Presentation, `Zuerst testen: ${PILOT.days}-Tage-Pilot`, `Mit ${PILOT.classes} testen, danach gemeinsam auswerten und entscheiden.`],
            [FileText, "Offerte statt Online-Kauf", "Sie erhalten eine Offerte und einen Vertrag, inklusive Datenschutz-Unterlagen und AVV-Vorlage."],
          ].map(([Icon, t, text]) => {
            const I = Icon as typeof School;
            return (
              <li key={t as string} className="flex gap-4 border-t-2 border-dashed border-[var(--line)] py-5">
                <I size={24} strokeWidth={2.2} aria-hidden className="mt-0.5 shrink-0" />
                <div><h3 className="text-heading">{t as string}</h3><p className="text-body mt-1 text-muted">{text as string}</p></div>
              </li>
            );
          })}
        </ul>
        <p className="text-small mt-5 text-muted">Alle Preise in CHF pro Schuljahr. Ob und welche Mehrwertsteuer dazukommt, steht in der Offerte.</p>
      </Section>

      <Section id="fragen" title="Fragen zu Preisen">
        <div className="max-w-3xl">
          <Faq items={faq} />
          <p className="text-small mt-5 text-muted">Weitere Antworten: <Link className={link} href="/hilfe#schulen">Hilfe für Schulen</Link></p>
        </div>
      </Section>

      <CtaBand title="Zuerst sehen, dann entscheiden." text="In einer Live-Demo zeigen wir WendApply aus Sicht der Schülerinnen und Schüler und der Lehrpersonen. Danach können Sie mit 1 bis 2 Klassen den Pilot starten.">
        <ButtonLink href={MAIL.demo} size="lg" icon={<Presentation size={18} strokeWidth={2.2} aria-hidden />}>Demo buchen</ButtonLink>
        <ButtonLink href="/pilot" size="lg" variant="secondary" className="!border-[var(--outline-fill)]" icon={<ArrowRight size={18} strokeWidth={2.4} aria-hidden />}>Zum Pilot</ButtonLink>
      </CtaBand>
    </PublicShell>
  );
}
