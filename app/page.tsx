import type { Metadata } from "next";
import { publicMetadata } from "@/lib/seo/pages";
import { JsonLd } from "@/components/seo/json-ld";
import { homeJsonLd } from "@/lib/seo/site";
import Link from "next/link";
import { ArrowRight, Check, Eye, Lock, MapPin, ShieldCheck, Trash2, UserRound } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { PublicShell, Section } from "@/components/public/public-shell";
import { Screenshot } from "@/components/public/screenshot";
import { AuthRedirect } from "@/components/public/auth-redirect";
import { DoodleArrow, DoodleBurst, DoodlePlane, DoodleSparkle, DoodleTrail } from "@/components/ui/doodles";
import { BRAND_TAGLINE, PILOT, POSITIONING } from "@/components/public/marketing";

export const metadata: Metadata = publicMetadata({ canonical: "/" });

const steps = [
  { n: "1", title: "Stellen finden und merken", text: "Suche Lehrstellen und Schnupperlehren, entdecke Betriebe auf der Karte und merke dir, was dich interessiert." },
  { n: "2", title: "Bewerbungen im Griff", text: "Trage deine Bewerbungen ein und halte Status, Fristen und Notizen an einem Ort fest. So geht nichts unter." },
  { n: "3", title: "Gemeinsam dranbleiben", text: "Tritt der Klasse bei und entscheide selbst, was deine Lehrperson sieht. So bekommst du Hilfe, wenn du sie brauchst." },
];

const trust = [
  { icon: Eye, title: "Du bestimmst, was geteilt wird", text: "Beim Klassenbeitritt siehst du mit Haken und Kreuz genau, was deine Lehrperson sieht und was nicht." },
  { icon: Lock, title: "Nur mit Anmeldung", text: "Deine Bewerbungen sind privat. Ohne deine Freigabe sieht sie niemand." },
  { icon: Trash2, title: "Konto jederzeit löschen", text: "In den Einstellungen löschst du dein Konto samt allen Daten selbst, ohne Umweg." },
  { icon: ShieldCheck, title: "Entwickelt in der Schweiz", text: "WendApply stammt von der Wendico KLG aus Gütighausen ZH. Details stehen in unserer Datenschutzerklärung." },
];

const stepTone = ["text-[var(--brand)]", "text-[var(--coral)]", "text-[var(--success-line)]"];
const link = "font-semibold text-[var(--brand)] underline decoration-2 underline-offset-4 hover:text-[var(--brand-strong)]";

export default function LandingPage() {
  return (
    <PublicShell>
      <JsonLd data={homeJsonLd()} />
      <AuthRedirect />
      <section aria-labelledby="hero-h" className="mx-auto grid w-full max-w-6xl items-center gap-12 overflow-x-clip px-4 pb-16 pt-10 sm:px-6 sm:pb-24 sm:pt-16 lg:grid-cols-[1.2fr_.8fr] lg:gap-10">
        <div className="animate-rise">
          <p className="mb-5 max-w-xl text-sm font-semibold uppercase tracking-[.08em] text-muted">{BRAND_TAGLINE}</p>
          <h1 id="hero-h" className="text-hero">Von der ersten Bewerbung bis zur <span className="marker">Zusage</span>.<DoodleBurst className="ml-2 inline-block h-[.45em] w-[.45em] -translate-y-[.15em] text-[var(--coral)]" /></h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted">Stellen finden, Bewerbungen und Fristen verwalten und bei Bedarf mit deiner Lehrperson teilen. Alles an einem Ort. 7 Tage gratis testen, mit Schullizenz für dich gratis.</p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <ButtonLink href="/login" size="lg" icon={<ArrowRight size={18} strokeWidth={2.4} aria-hidden />}>Kostenlos testen</ButtonLink>
            <ButtonLink href="/schulen" size="lg" variant="secondary">Für Schulen</ButtonLink>
          </div>
          <p className="text-small mt-5 max-w-md text-muted">Anmeldung mit E-Mail oder Google. Dein Konto kannst du jederzeit selbst löschen. <Link className={link} href="/anleitung">So funktioniert’s</Link></p>
        </div>
        <div className="relative mx-auto w-full max-w-md lg:max-w-none">
          <Screenshot name="04-dashboard" alt="Startseite von WendApply: Weg zur Lehrstelle mit gemerkten und abgeschickten Bewerbungen, Gesprächen und Zusagen, zuletzt geänderte Bewerbungen und bald fällige Fristen" width={1600} height={1280} priority className="tilt-r" />
          <span className="sticker tilt-l3 absolute -left-2 -top-4 text-sm sm:-left-5">7 Tage gratis testen</span>
          <span className="sticker sticker-mint tilt-r absolute -bottom-4 right-3 text-sm"><Check size={14} strokeWidth={3} aria-hidden />Zusage!</span>
          <DoodleArrow className="absolute -left-16 top-1/3 hidden h-12 w-16 text-[var(--ink)] lg:block" />
        </div>
      </section>

      <Section id="so-gehts" title={<>In drei Schritten von der Suche zur <span className="marker">Zusage</span></>} tint>
        <ol className="grid gap-x-10 gap-y-8 md:grid-cols-3">
          {steps.map((s, i) => (
            <li key={s.n} className={i === 1 ? "md:mt-10" : i === 2 ? "md:mt-20" : ""}>
              <span aria-hidden className={`num-display block ${stepTone[i]}`}>{s.n}</span>
              <h3 className="text-heading mt-3">{s.title}</h3>
              <p className="text-body mt-2 text-muted">{s.text}</p>
            </li>
          ))}
        </ol>
      </Section>

      <Section id="schueler" title="Finden, bewerben, dranbleiben" intro="Du suchst eine Lehrstelle oder eine Schnupperlehre? WendApply hilft dir, deine Bewerbungen zu organisieren und den Überblick zu behalten, auch wenn es viele werden.">
        <div className="grid items-center gap-10 lg:grid-cols-[.85fr_1.15fr]">
          <ul className="rows">
            {[
              [MapPin, "Stellen suchen und Betriebe auf der Karte entdecken"],
              [UserRound, "Alle Bewerbungen mit Status, Frist und Notizen an einem Ort"],
              [Eye, "Fristen immer im Blick, damit keine Bewerbung untergeht"],
            ].map(([Icon, text]) => {
              const I = Icon as typeof MapPin;
              return <li key={text as string} className="flex items-start gap-3.5 py-4"><I size={22} strokeWidth={2.2} aria-hidden className="mt-0.5 shrink-0 text-[var(--brand)]" /><span className="text-base font-medium">{text as string}</span></li>;
            })}
          </ul>
          <Screenshot name="05-search" alt="Lehrstellensuche in WendApply: Suche nach «Informatiker» mit Filtern für Ort, Kanton und Art der Stelle und passenden Lehrstellen aus mehreren Stellenbörsen" width={1600} height={1280} className="tilt-l" />
        </div>
      </Section>

      <Section id="lehrpersonen" title="Den Stand der Klasse sehen, ohne Nachfragen" intro="Eine Übersicht zeigt, wer wo steht. Es zählen nur die Angaben von Schülerinnen und Schülern, die sie ausdrücklich teilen." tint>
        <div className="grid items-center gap-10 lg:grid-cols-[1.15fr_.85fr]">
          <Screenshot name="24-teacher-dashboard" alt="Lehrpersonen-Übersicht in WendApply: Bewerbungen, Gespräche und Zusagen aller Klassen, Schülerinnen und Schüler, die Aufmerksamkeit brauchen, und die Klassenliste" width={1600} height={1280} />
          <div>
            <ul className="rows text-base font-medium">
              <li className="flex gap-3.5 py-4"><Check size={22} strokeWidth={2.6} aria-hidden className="mt-0.5 shrink-0 text-[var(--brand)]" /> Klasse in unter einer Minute erstellen und per Link, Code oder QR-Code einladen</li>
              <li className="flex gap-3.5 py-4"><Check size={22} strokeWidth={2.6} aria-hidden className="mt-0.5 shrink-0 text-[var(--brand)]" /> Sehen, wer Hilfe braucht, ohne zusätzliche Listen zu führen</li>
              <li className="flex gap-3.5 py-4"><Check size={22} strokeWidth={2.6} aria-hidden className="mt-0.5 shrink-0 text-[var(--brand)]" /> Gemeinsame Klassenziele und Auswertungen für die Begleitung</li>
            </ul>
            <p className="text-body mt-6 text-muted">{POSITIONING}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <ButtonLink href="/schulen" variant="secondary" size="lg" icon={<ArrowRight size={18} strokeWidth={2.4} aria-hidden />}>Mehr für Schulen</ButtonLink>
              <ButtonLink href="/preise" variant="ghost" size="lg">Preise</ButtonLink>
              <ButtonLink href="/pilot" variant="ghost" size="lg">{PILOT.days}-Tage-Pilot</ButtonLink>
            </div>
          </div>
        </div>
      </Section>

      <Section id="vertrauen" title={<>Deine Daten <span className="marker">gehören dir</span></>}>
        <ul className="grid gap-x-12 sm:grid-cols-2">
          {trust.map(({ icon: Icon, title: t, text }) => (
            <li key={t} className="flex gap-4 border-t-2 border-dashed border-[var(--line)] py-5">
              <Icon size={24} strokeWidth={2.2} aria-hidden className="mt-0.5 shrink-0 text-[var(--ink)]" />
              <div><h3 className="text-heading">{t}</h3><p className="text-body mt-1 text-muted">{text}</p></div>
            </li>
          ))}
        </ul>
        <p className="text-small mt-5 text-muted">Mehr dazu: <Link className={link} href="/datenschutz-uebersicht">Datenschutz im Überblick</Link> · <Link className={link} href="/datenschutz">Datenschutzerklärung</Link> · <Link className={link} href="/datenschutz-jugend">Datenschutz einfach erklärt</Link></p>
      </Section>

      <section aria-labelledby="cta-h" className="mx-auto w-full max-w-6xl overflow-x-clip px-4 pb-16 sm:px-6 sm:pb-24">
        <div className="relative rounded-[var(--radius-xl)] border-[length:var(--border-w)] border-[var(--outline-fill)] bg-[var(--sun)] px-6 py-10 text-[var(--on-sun)] shadow-[var(--shadow-lg)] sm:px-12 sm:py-14">
          <DoodleSparkle className="absolute right-6 top-6 h-8 w-8 sm:right-10" />
          <h2 id="cta-h" className="text-display max-w-2xl">Bereit für die erste Bewerbung?</h2>
          <p className="mt-4 max-w-xl text-base">Konto erstellen dauert eine Minute. Schulen testen WendApply im {PILOT.days}-Tage-Pilot mit {PILOT.classes}.</p>
          <div className="mt-7 flex flex-wrap gap-3">
            <ButtonLink href="/login" size="lg" icon={<ArrowRight size={18} strokeWidth={2.4} aria-hidden />}>Kostenlos testen</ButtonLink>
            <ButtonLink href="/schulen" size="lg" variant="secondary" className="!border-[var(--outline-fill)]">Für Schulen</ButtonLink>
          </div>
          <div className="pointer-events-none absolute bottom-6 right-8 hidden items-end gap-1 md:flex" aria-hidden>
            <DoodleTrail className="h-12 w-36" />
            <DoodlePlane className="mb-6 h-12 w-16" />
          </div>
        </div>
      </section>
    </PublicShell>
  );
}
