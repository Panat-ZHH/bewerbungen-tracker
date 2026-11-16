import type { Metadata } from "next";
import { publicMetadata, publicBreadcrumb } from "@/lib/seo/pages";
import { JsonLd } from "@/components/seo/json-ld";
import { faqJsonLd } from "@/lib/seo/site";
import Link from "next/link";
import { ArrowRight, Building2, CalendarDays, Check, CreditCard, FileText, Heart, Mail, Presentation, School } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { PublicShell, Section } from "@/components/public/public-shell";
import { CtaBand } from "@/components/public/cta-band";
import { Faq, type FaqItem } from "@/components/public/faq";
import { FAMILY, MAIL, PACKAGES, PILOT, chf, perStudentMonth, perStudentYear } from "@/components/public/marketing";
import { FREE_NOTICE, PAYMENT_LABEL, VAT_NOTE, buyHref, familyPlan, intervalPriceText, onlinePaymentEnabled, priceText, savingText, vatNote } from "@/components/billing/logic";


export const metadata: Metadata = publicMetadata({ canonical: "/preise" });

const pro = PACKAGES.find((p) => p.recommended)!;
/** Online payment (feature flag, default off). Off = today's offer/contact flows plus the honest "aktuell kostenlos" note. */
const online = onlinePaymentEnabled();
const fam = familyPlan();
const link = "font-semibold text-[var(--brand)] underline decoration-2 underline-offset-4 hover:text-[var(--brand-strong)]";

const faq: FaqItem[] = [
  { q: "Müssen Schülerinnen und Schüler etwas bezahlen?", a: "Nein. Die Schule (bzw. Gemeinde oder Schulträger) bezahlt die Lizenz. Schülerinnen und Schüler haben kein kostenpflichtiges Konto und müssen nichts kaufen." },
  { q: "Wie wird gezählt?", a: "Massgebend ist die Zahl der Schülerinnen und Schüler, die WendApply an Ihrer Schule nutzen. Lehrpersonen sind in allen Paketen inbegriffen." },
  { q: "Kann die Schule monatlich bezahlen?", a: "Wir empfehlen den Jahresvertrag. Eine monatliche Zahlung ist gegen Aufpreis möglich. Die Details stehen in der Offerte." },
  { q: "Wir haben mehrere Schulhäuser oder sind ein Schulverband.", a: "Für mehrere Standorte und Schulverbände erstellen wir ein individuelles Angebot. Schreiben Sie uns, wie viele Standorte und Schülerinnen und Schüler es sind." },
  { q: "Können wir zuerst testen?", a: <>Ja, mit dem <Link className={link} href="/pilot">30-Tage-Pilot</Link> für 1 bis 2 Klassen. Danach entscheiden Sie in einem gemeinsamen Gespräch über die Jahreslizenz.</> },
  { q: "Gibt es ein Angebot für Familien?", a: online
    ? <>Ja: das {FAMILY.name} für 1 Schüler- und 1 Elternaccount, {priceText(fam)}, {vatNote(fam)}. Buchbar im Elternkonto unter <Link className={link} href="/familie">Meine Familie</Link>.</>
    : <>Ja, bald: das {FAMILY.name} für 1 Schüler- und 1 Elternaccount, {priceText(fam)}, {vatNote(fam)}. Mehr unter <Link className={link} href="/familien">Für Familien</Link>.</> },
  online
    ? { q: "Kann man online bestellen?", a: `Ja. Die Schuladministration wählt das Paket in WendApply unter «Abo & Rechnung» und bezahlt mit ${PAYMENT_LABEL.card.title} oder auf ${PAYMENT_LABEL.invoice.title} (zahlbar innert 30 Tagen). Eine Offerte mit Vertrag ist weiterhin möglich.` }
    : { q: "Kann man online bestellen?", a: `Noch nicht. ${FREE_NOTICE} Bis dahin erhalten Sie eine Offerte und einen Vertrag, wie bei Schulen üblich.` },
];

export default function PreisePage() {
  return (
    <PublicShell>
      <JsonLd data={publicBreadcrumb("/preise")} />
      <JsonLd data={faqJsonLd(faq)} />
      <section aria-labelledby="preise-h" className="mx-auto w-full max-w-6xl px-4 pb-10 pt-10 sm:px-6 sm:pt-16">
        <p className="sticker sticker-paper tilt-l mb-5 text-sm">Preise für Schulen</p>
        <h1 id="preise-h" className="animate-rise text-hero max-w-4xl hyphens-auto break-words">Eine Lizenz für die ganze Schule. <span className="marker [box-decoration-break:clone]">Für Schüler kostenlos.</span></h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted">Die Schule bezahlt eine Jahreslizenz nach Anzahl Schülerinnen und Schüler. Lehrpersonen sind immer inbegriffen. Im Paket Professional sind das bei {pro.maxStudents} Schülerinnen und Schülern rund CHF {chf(perStudentMonth(pro), 2)} pro Schüler und Monat.</p>
        <p role="note" data-billing-notice={online ? "on" : "off"} className={`status ${online ? "status-success" : "status-info"} mt-6 max-w-2xl text-[15px] font-semibold`}>
          {online ? `Online abschliessen: mit ${PAYMENT_LABEL.card.title} oder auf ${PAYMENT_LABEL.invoice.title}. Alle Schulpreise ${VAT_NOTE}.` : `${FREE_NOTICE} Für eine Offerte schreiben Sie uns.`}
        </p>
      </section>

      <section aria-label="Pakete" className="mx-auto w-full max-w-6xl px-4 pb-14 sm:px-6 sm:pb-20">
        <ul className="grid gap-6 pt-4 md:grid-cols-3 md:items-stretch">
          {PACKAGES.map((p) => (
            <li key={p.id} className={`panel relative flex flex-col p-6 sm:p-7 ${p.recommended ? "md:-mt-4 shadow-[var(--shadow-lg)] ring-4 ring-[var(--sun)]" : ""}`} aria-labelledby={`pkg-${p.id}`}>
              {p.recommended && <span className="sticker tilt-r absolute -top-3.5 right-5 text-sm">Empfohlen</span>}
              <h2 id={`pkg-${p.id}`} className="text-title !text-[1.75rem]">{p.name}</h2>
              <p className="text-small mt-1 text-muted">{p.audience}</p>
              <p className="mt-5 flex items-baseline gap-2"><span className="text-sm font-semibold">CHF</span><span className="num-big !text-5xl">{chf(p.pricePerYear)}</span><span className="text-sm text-muted">pro Jahr, {VAT_NOTE}</span></p>
              <p className="mt-2 text-[15px] font-semibold">bis {p.maxStudents} Schülerinnen und Schüler</p>
              <p className="text-small mt-1 text-muted">entspricht ab CHF {chf(perStudentYear(p), 2)} pro Schüler und Jahr</p>
              <ul className="mt-5 flex-1 space-y-2.5 text-[15px]">
                {p.features.map((f) => <li key={f} className="flex gap-2.5"><Check size={18} strokeWidth={2.8} aria-hidden className="mt-0.5 shrink-0 text-[var(--brand)]" />{f}</li>)}
              </ul>
              {online && <ButtonLink href={buyHref(p.id)} variant={p.recommended ? "primary" : "secondary"} full className="mt-7" icon={<CreditCard size={16} strokeWidth={2.2} aria-hidden />} aria-label={`${p.name} online abschliessen`}>Online abschliessen</ButtonLink>}
              <ButtonLink href={MAIL.offer(p.name)} variant={online ? "ghost" : p.recommended ? "primary" : "secondary"} full className={online ? "mt-2" : "mt-7"} icon={<Mail size={16} strokeWidth={2.2} aria-hidden />} aria-label={`Offerte für ${p.name} anfragen (E-Mail)`}>Offerte anfragen</ButtonLink>
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

      <section id="familien" aria-labelledby="familien-h" className="mx-auto w-full max-w-6xl scroll-mt-24 px-4 pb-14 sm:px-6 sm:pb-20">
        <h2 id="familien-h" className="text-title max-w-3xl">Für Familien</h2>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted">Für Eltern und Jugendliche, deren Schule WendApply (noch) nicht nutzt. {online ? "Das Familienpaket kann online gebucht werden." : <>Das Familienpaket ist {FAMILY.status}.</>}</p>
        <div className="panel relative mt-8 grid gap-6 p-6 sm:p-7 md:grid-cols-[1fr_1.2fr_auto] md:items-center" aria-labelledby="pkg-family">
          <span className="sticker tilt-r absolute -top-3.5 right-5 text-sm">{online ? "Online buchbar" : FAMILY.status}</span>
          <div>
            <h3 id="pkg-family" className="text-title flex items-center gap-2 !text-[1.75rem]"><Heart size={26} strokeWidth={2.2} aria-hidden className="text-[var(--brand)]" />{FAMILY.name}</h3>
            <p className="text-small mt-1 text-muted">{FAMILY.seatsChildren} Schüleraccount + {FAMILY.seatsParents} Elternaccount</p>
            <p className="mt-4 flex items-baseline gap-2" data-family-price><span className="num-big !text-4xl">{intervalPriceText(fam, "month")}</span></p>
            <p className="text-small mt-1 text-muted">oder {intervalPriceText(fam, "year")} ({savingText(fam)}), {vatNote(fam)}</p>
          </div>
          <ul className="space-y-2 text-[15px]">
            {FAMILY.features.map((f) => <li key={f} className="flex gap-2.5"><Check size={18} strokeWidth={2.8} aria-hidden className="mt-0.5 shrink-0 text-[var(--brand)]" />{f}</li>)}
          </ul>
          {online
            ? <div className="flex flex-col gap-2">
                <ButtonLink href={buyHref("family", "year")} variant="sun" icon={<CreditCard size={16} strokeWidth={2.2} aria-hidden />}>Jährlich buchen</ButtonLink>
                <ButtonLink href={buyHref("family", "month")} variant="secondary" icon={<CreditCard size={16} strokeWidth={2.2} aria-hidden />}>Monatlich buchen</ButtonLink>
              </div>
            : <ButtonLink href="/familien#warteliste" variant="secondary" icon={<ArrowRight size={16} strokeWidth={2.4} aria-hidden />}>Zugang anfragen</ButtonLink>}
        </div>
        <p className="text-small mt-4 text-muted">{online ? `Bezahlung mit ${PAYMENT_LABEL.card.title}, monatlich oder jährlich, kündbar auf Ende der Laufzeit.` : "Noch kein Online-Kauf: Der Zugang wird in der Startphase manuell freigeschaltet."} Für Schülerinnen und Schüler einer Schule mit Lizenz bleibt WendApply kostenlos.</p>
      </section>

      <Section id="konditionen" title="Gut zu wissen" tint>
        <ul className="grid gap-x-12 sm:grid-cols-2">
          {[
            [School, "Schüler bezahlen nichts", "Die Lizenz bezahlt die Schule, die Gemeinde oder der Schulträger. Für Schülerinnen und Schüler gibt es kein kostenpflichtiges Konto."],
            [CalendarDays, "Jahresvertrag", "Wir empfehlen den Jahresvertrag. Monatliche Zahlung ist gegen Aufpreis möglich."],
            [Presentation, `Zuerst testen: ${PILOT.days}-Tage-Pilot`, `Mit ${PILOT.classes} testen, danach gemeinsam auswerten und entscheiden.`],
            online
              ? [FileText, "Online oder mit Offerte", "Online mit Karte oder auf Rechnung abschliessen, oder eine Offerte mit Vertrag, Datenschutz-Unterlagen und AVV-Vorlage anfragen."]
              : [FileText, "Offerte statt Online-Kauf", "Sie erhalten eine Offerte und einen Vertrag, inklusive Datenschutz-Unterlagen und AVV-Vorlage."],
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
        <p className="text-small mt-5 text-muted">Alle Preise in CHF pro Schuljahr, {VAT_NOTE}.</p>
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
