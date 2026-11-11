import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Eye, GraduationCap, Lock, MapPin, ShieldCheck, Trash2, UserRound } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { PublicShell, Section } from "@/components/public/public-shell";
import { Screenshot } from "@/components/public/screenshot";
import { AuthRedirect } from "@/components/public/auth-redirect";

const title = "WendApply: Bewerbungen für die Lehrstelle im Blick behalten";
const description = "WendApply begleitet Schülerinnen und Schüler durch die Lehrstellensuche: Stellen finden, Bewerbungen und Fristen im Griff, Lehrperson sieht nur, was du teilst.";

export const metadata: Metadata = {
  title: { absolute: title },
  description,
  alternates: { canonical: "/" },
  openGraph: { title, description, type: "website", locale: "de_CH", siteName: "WendApply", images: [{ url: "/landing/04-dashboard-light.webp", width: 1200, height: 978, alt: "WendApply Übersicht" }] },
  twitter: { card: "summary_large_image", title, description },
};

const steps = [
  { n: "1", title: "Stellen finden und merken", text: "Suche Lehrstellen und Schnupperlehren, entdecke Betriebe auf der Karte und merke dir, was dich interessiert." },
  { n: "2", title: "Bewerbungen im Griff", text: "Trage deine Bewerbungen ein und halte Status, Fristen und Notizen an einem Ort fest. So geht nichts unter." },
  { n: "3", title: "Gemeinsam dranbleiben", text: "Tritt der Klasse bei und entscheide selbst, was deine Lehrperson sieht. So bekommst du Hilfe, wenn du sie brauchst." },
];

const trust = [
  { icon: Eye, title: "Du bestimmst, was geteilt wird", text: "Beim Klassenbeitritt siehst du mit Haken und Kreuz genau, was deine Lehrperson sieht und was nicht." },
  { icon: Lock, title: "Nur mit Anmeldung", text: "Deine Bewerbungen sind privat. Ohne deine Freigabe sieht sie niemand." },
  { icon: Trash2, title: "Konto jederzeit löschen", text: "In den Einstellungen löschst du dein Konto samt allen Daten selbst, ohne Umweg." },
  { icon: ShieldCheck, title: "Entwickelt in der Schweiz", text: "WendApply stammt von Wendico aus Kleinandelfingen. Details stehen in unserer Datenschutzerklärung." },
];

export default function LandingPage() {
  return (
    <PublicShell>
      <AuthRedirect />
      <section aria-labelledby="hero-h" className="mx-auto grid w-full max-w-6xl items-center gap-10 px-4 py-12 sm:px-6 sm:py-20 lg:grid-cols-[1.05fr_1fr]">
        <div>
          <p className="text-eyebrow">Für die Lehrstellensuche</p>
          <h1 id="hero-h" className="text-display mt-4">Deine Lehrstellensuche. <span className="text-gradient">Ganz einfach im Blick.</span></h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted">Stellen finden, Bewerbungen und Fristen verwalten und bei Bedarf mit deiner Lehrperson teilen. Alles an einem Ort, kostenlos für Schülerinnen und Schüler.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonLink href="/login" size="lg" icon={<ArrowRight size={18} aria-hidden />}>Loslegen</ButtonLink>
            <ButtonLink href="/schulen" size="lg" variant="secondary">Für Schulen</ButtonLink>
          </div>
          <p className="text-small mt-4 text-muted">Anmeldung mit E-Mail oder Google. Dein Konto kannst du jederzeit selbst löschen.</p>
        </div>
        <Screenshot name="04-dashboard" alt="Übersicht in WendApply mit Bewerbungen, Status und anstehenden Fristen" width={1200} height={978} priority />
      </section>

      <Section id="so-gehts" eyebrow="So funktioniert es" title="In drei Schritten von der Suche zur Zusage" tint>
        <ol className="grid gap-4 md:grid-cols-3">
          {steps.map((s) => (
            <li key={s.n} className="panel p-6">
              <span aria-hidden className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--brand-soft)] text-sm font-bold text-[var(--brand)]">{s.n}</span>
              <h3 className="text-heading mt-4">{s.title}</h3>
              <p className="text-body mt-2 text-muted">{s.text}</p>
            </li>
          ))}
        </ol>
      </Section>

      <Section id="schueler" eyebrow="Für Schülerinnen und Schüler" title="Finden, bewerben, dranbleiben" intro="Du suchst eine Lehrstelle oder eine Schnupperlehre? WendApply hilft dir, den Überblick zu behalten, auch wenn es viele Bewerbungen werden.">
        <div className="grid items-center gap-8 lg:grid-cols-2">
          <ul className="space-y-4">
            {[
              [MapPin, "Stellen suchen und Betriebe auf der Karte entdecken"],
              [UserRound, "Alle Bewerbungen mit Status, Frist und Notizen an einem Ort"],
              [Eye, "Fristen immer im Blick, damit keine Bewerbung untergeht"],
            ].map(([Icon, text]) => {
              const I = Icon as typeof MapPin;
              return <li key={text as string} className="flex items-start gap-3"><span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--brand-soft)] text-[var(--brand)]"><I size={18} aria-hidden /></span><span className="text-body pt-1.5">{text as string}</span></li>;
            })}
          </ul>
          <Screenshot name="05-search" alt="Stellensuche in WendApply mit Filtern und Ergebnissen" width={1200} height={1019} />
        </div>
      </Section>

      <Section id="lehrpersonen" eyebrow="Für Lehrpersonen" title="Den Stand der Klasse sehen, ohne Nachfragen" intro="Eine Übersicht zeigt, wer wo steht. Es zählen nur die Angaben von Schülerinnen und Schülern, die sie ausdrücklich teilen." tint>
        <div className="grid items-center gap-8 lg:grid-cols-2">
          <Screenshot name="24-teacher-dashboard" alt="Lehrpersonen-Übersicht mit Klassen, Bewerbungen und Fristen" width={1200} height={1042} />
          <div>
            <ul className="space-y-3 text-body">
              <li className="flex gap-3"><GraduationCap size={20} aria-hidden className="mt-0.5 shrink-0 text-[var(--brand)]" /> Klasse in unter einer Minute erstellen und per Link, Code oder QR-Code einladen</li>
              <li className="flex gap-3"><GraduationCap size={20} aria-hidden className="mt-0.5 shrink-0 text-[var(--brand)]" /> Sehen, wer Hilfe braucht, ohne dass Sie dafür zusätzliche Listen führen</li>
              <li className="flex gap-3"><GraduationCap size={20} aria-hidden className="mt-0.5 shrink-0 text-[var(--brand)]" /> Kostenloser Pilot für Schulen</li>
            </ul>
            <ButtonLink href="/schulen" variant="secondary" size="lg" className="mt-6" icon={<ArrowRight size={18} aria-hidden />}>Mehr für Schulen</ButtonLink>
          </div>
        </div>
      </Section>

      <Section id="vertrauen" eyebrow="Datenschutz und Vertrauen" title="Deine Daten gehören dir">
        <ul className="grid gap-4 sm:grid-cols-2">
          {trust.map(({ icon: Icon, title: t, text }) => (
            <li key={t} className="panel flex gap-4 p-5">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--success-bg)] text-[var(--success-fg)]"><Icon size={20} aria-hidden /></span>
              <div><h3 className="text-heading">{t}</h3><p className="text-body mt-1 text-muted">{text}</p></div>
            </li>
          ))}
        </ul>
        <p className="text-small mt-5 text-muted">Mehr dazu: <Link className="font-medium text-[var(--brand)] underline underline-offset-4" href="/datenschutz">Datenschutzerklärung</Link> · <Link className="font-medium text-[var(--brand)] underline underline-offset-4" href="/datenschutz-jugend">Datenschutz einfach erklärt</Link></p>
      </Section>

      <section aria-labelledby="cta-h" className="mx-auto w-full max-w-6xl px-4 pb-16 sm:px-6 sm:pb-24">
        <div className="rounded-[var(--radius-xl)] bg-[var(--brand)] px-6 py-12 text-center text-white shadow-[var(--shadow-sm)] sm:px-12">
          <h2 id="cta-h" className="text-title">Bereit für die erste Bewerbung?</h2>
          <p className="mx-auto mt-3 max-w-xl text-[15px] opacity-90">Konto erstellen dauert eine Minute. Schulen können WendApply kostenlos im Pilot testen.</p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <ButtonLink href="/login" size="lg" variant="secondary" className="!bg-white !text-[#0b1f3f]">Loslegen</ButtonLink>
            <ButtonLink href="/schulen" size="lg" variant="ghost" className="!text-white hover:!bg-white/15">Für Schulen</ButtonLink>
          </div>
        </div>
      </section>
    </PublicShell>
  );
}
