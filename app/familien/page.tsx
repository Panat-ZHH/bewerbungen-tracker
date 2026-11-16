import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BadgeCheck, Ban, Check, Download, Eye, EyeOff, Footprints, House, LayoutList, ListChecks, Mail, MailPlus, ShieldCheck, Sparkles, Trash2, UserPlus, Users } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { PublicShell, Section } from "@/components/public/public-shell";
import { Screenshot } from "@/components/public/screenshot";
import { CtaBand } from "@/components/public/cta-band";
import { Faq, type FaqItem } from "@/components/public/faq";
import { WaitlistForm } from "@/components/public/waitlist-form";
import { FAMILY, MAIL_FAMILY, WAITLIST_KIND_FAMILY } from "@/components/public/marketing";

const title = "WendApply für Familien: Lehrstellensuche gemeinsam, aber mit Privatsphäre";
const description = "WendApply für Eltern und Jugendliche: Bewerbungen, Fristen und Fortschritt im Blick. Familienpaket (1 Elternteil + 1 Kind) bald verfügbar, Preis folgt. Einwilligung unter 16, das Kind entscheidet, was geteilt wird.";
export const metadata: Metadata = {
  title, description, alternates: { canonical: "/familien" },
  openGraph: { title, description, type: "website", locale: "de_CH", siteName: "WendApply", images: [{ url: "/landing/04-dashboard-light.webp", width: 1200, height: 978, alt: "Übersicht mit Bewerbungen, Status und Fristen in WendApply" }] },
};

type Item = { icon: typeof Eye; title: string; text: string };

const young: Item[] = [
  { icon: LayoutList, title: "Alles an einem Ort", text: "Stellen, Bewerbungen, Status, Fristen und Unterlagen in einer übersichtlichen Liste, auch ohne Schule, die WendApply nutzt." },
  { icon: Footprints, title: "Fortschritt sehen", text: "Jeder Schritt von der Schnupperlehre bis zum Lehrvertrag wird sichtbar. Das hilft, nach einer Absage weiterzumachen." },
  { icon: House, title: "Persönliches Dorf", text: "Jede Bewerbung wird zu einem Haus, das mit dem Fortschritt wächst. Belohnt werden sinnvolle Schritte, nicht möglichst viele Bewerbungen." },
];

const parents: Item[] = [
  { icon: Eye, title: "Den Stand kennen", text: "Sie sehen, wie viele Bewerbungen laufen und wo Ihr Kind steht, soweit es das teilt. Ohne täglich nachfragen zu müssen." },
  { icon: ListChecks, title: "Gezielt unterstützen", text: "Fristen und nächste Schritte sind sichtbar. So wissen Sie, wann Hilfe beim Brief oder bei der Vorbereitung aufs Gespräch nützt." },
  { icon: Sparkles, title: "Motivation statt Kontrolle", text: "Fortschritt und Dorf machen Erfolge sichtbar. Bewerbungsdetails und Notizen bleiben privat, wenn Ihr Kind das so will." },
];

const steps: Item[] = [
  { icon: UserPlus, title: "Registrieren", text: "Elternteil oder Jugendliche:r erstellt ein Konto. Wir fragen nur das Geburtsjahr, nicht das genaue Datum." },
  { icon: MailPlus, title: "Kind einladen", text: "Sie erstellen einen Einladungscode (7 Tage gültig, nur einmal nutzbar). Ihr Kind kann umgekehrt auch Sie einladen." },
  { icon: BadgeCheck, title: "Einwilligung", text: "Ist Ihr Kind unter 16, geben Sie als Elternteil die Einwilligung. Erst dann wird geteilt, was Ihr Kind freigibt." },
  { icon: Footprints, title: "Fortschritt sehen", text: "Sie sehen den freigegebenen Fortschritt: Anzahl und Status der Bewerbungen, das Dorf und, falls freigegeben, die Liste." },
];

const privacy: Item[] = [
  { icon: ListChecks, title: "Datenminimierung", text: "Nur was nötig ist: Name, E-Mail und das Geburtsjahr, um zu prüfen, ob eine Einwilligung nötig ist. Kein genaues Geburtsdatum." },
  { icon: BadgeCheck, title: "Einwilligung unter 16", text: "Für Kinder unter 16 braucht das Teilen mit dem Elternkonto die Einwilligung der Eltern (Schweizer DSG, DSGVO Art. 8). Ohne Einwilligung bleibt das Teilen aus." },
  { icon: EyeOff, title: "Das Kind entscheidet", text: "Ihr Kind wählt, was das Elternkonto sieht: Fortschritt, Dorf, Bewerbungsliste. Notizen und Dokumente bleiben standardmässig privat. Das Teilen lässt sich jederzeit beenden." },
  { icon: Download, title: "Export und Löschung", text: "Alle können ihre eigenen Daten exportieren, die Familie verlassen und das Konto löschen. Verlassen beendet das Teilen sofort." },
  { icon: Ban, title: "Keine Werbung", text: "WendApply zeigt keine Werbung und verkauft keine Daten. Das gilt für Eltern- und Kinderkonten gleich." },
  { icon: Users, title: "Getrennt von der Schule", text: "Ein Familienkonto sieht nie Mitschülerinnen, Mitschüler oder andere Familien. Nutzt die Schule WendApply, bleibt der Schulzugang davon unberührt." },
];

const link = "font-semibold text-[var(--brand)] underline decoration-2 underline-offset-4 hover:text-[var(--brand-strong)]";

const faq: FaqItem[] = [
  { q: "Was kostet das Familienpaket?", a: "Der Preis ist noch nicht festgelegt. Es gibt noch keinen Kauf und keine Zahlung in der App. Wer sich auf die Warteliste setzt, erfährt den Preis zuerst und entscheidet dann." },
  { q: "Unsere Schule nutzt WendApply schon. Brauchen wir das Familienpaket?", a: "Nein. Für Schülerinnen und Schüler einer Schule mit Lizenz ist WendApply kostenlos. Das Familienpaket ist für Familien, deren Schule WendApply (noch) nicht nutzt, oder für Eltern, die den Fortschritt begleiten möchten." },
  { q: "Kann mein Kind WendApply auch allein nutzen?", a: "Ja. Jugendliche können ein eigenes Konto erstellen und WendApply ohne Elternkonto nutzen. Das Teilen mit Eltern ist freiwillig." },
  { q: "Ab welchem Alter braucht es eine Einwilligung?", a: <>Für Kinder unter 16 geben die Eltern die Einwilligung, bevor Daten mit dem Elternkonto geteilt werden. Die App selbst kann Ihr Kind auch ohne Einwilligung nutzen, nur das Teilen bleibt aus. Mehr dazu unter <Link className={link} href="/datenschutz-jugend">Datenschutz für Jugendliche</Link>.</> },
  { q: "Sehe ich als Elternteil alle Bewerbungen und Notizen?", a: "Nur das, was Ihr Kind freigibt. Standardmässig sind das der Fortschritt und das Dorf. Die Bewerbungsliste ist nur sichtbar, wenn Ihr Kind sie freigibt. Notizen und Dokumente bleiben privat." },
  { q: "Kann ich später ein zweites Kind hinzufügen?", a: "Das Familienpaket startet mit 1 Elternteil und 1 Kind. Weitere Kinder und ein zweites Elternteil sollen später möglich sein." },
  { q: "Was passiert, wenn mein Kind das Teilen beendet?", a: "Das Elternkonto sieht dann keinen Fortschritt mehr. Ihr Kind behält alle seine Daten. Sie können die Familie jederzeit verlassen oder Ihr Kind aus der Familie entfernen." },
];

function Grid({ items, cols = "sm:grid-cols-2 lg:grid-cols-3" }: { items: Item[]; cols?: string }) {
  return (
    <ul className={`grid gap-x-10 ${cols}`}>
      {items.map(({ icon: Icon, title: t, text }) => (
        <li key={t} className="border-t-2 border-dashed border-[var(--line)] py-5">
          <h3 className="text-heading flex items-start gap-2.5"><Icon size={22} strokeWidth={2.2} aria-hidden className="mt-0.5 shrink-0 text-[var(--brand)]" />{t}</h3>
          <p className="text-body mt-2 pl-8 text-muted">{text}</p>
        </li>
      ))}
    </ul>
  );
}

export default function FamilienPage() {
  return (
    <PublicShell>
      <section aria-labelledby="familien-h" className="mx-auto grid w-full max-w-6xl items-center gap-12 overflow-x-clip px-4 pb-14 pt-10 sm:px-6 sm:pb-20 sm:pt-16 lg:grid-cols-[1.15fr_.85fr]">
        <div className="min-w-0">
          <p className="sticker sticker-paper tilt-l mb-5 text-sm">Für Familien · {FAMILY.status}</p>
          <h1 id="familien-h" className="animate-rise text-hero max-w-4xl hyphens-auto break-words">Gemeinsam durch die Lehrstellensuche. <span className="marker [box-decoration-break:clone]">Mit Privatsphäre.</span></h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted">WendApply hilft Jugendlichen, Bewerbungen, Fristen und Fortschritt im Griff zu haben. Eltern sehen, wie es vorwärtsgeht, aber nur das, was ihr Kind teilen möchte.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonLink href="#warteliste" size="lg" icon={<ArrowRight size={18} strokeWidth={2.4} aria-hidden />}>Zugang anfragen</ButtonLink>
            <ButtonLink href="#so-gehts" size="lg" variant="secondary">So funktioniert es</ButtonLink>
          </div>
          <p className="text-small mt-5 text-muted">Nutzt eure Schule WendApply? Dann ist es für Schülerinnen und Schüler kostenlos. <Link className={link} href="/schulen">Für Schulen</Link></p>
        </div>
        <Screenshot name="04-dashboard" alt="Übersicht für Jugendliche mit Bewerbungen, Status und Fristen" width={1200} height={978} priority className="tilt-r" />
      </section>

      <Section id="jugendliche" title={<>Für Jugendliche: <span className="marker">dranbleiben lohnt sich</span></>} intro="Mit eigenem Konto, auch wenn die Schule WendApply nicht nutzt. Du entscheidest, was deine Eltern sehen." tint>
        <Grid items={young} />
      </Section>

      <Section id="eltern" title="Für Eltern: begleiten statt kontrollieren" intro="Die Lehrstellensuche ist für die ganze Familie eine intensive Zeit. WendApply zeigt, wo Ihr Kind steht, ohne in seine Privatsphäre einzugreifen.">
        <Grid items={parents} />
      </Section>

      <Section id="familienpaket" title={<>Das <span className="marker">Familienpaket</span></>} intro="Ein Paket für ein Elternteil und ein Kind. Weitere Kinder und ein zweites Elternteil sollen später dazukommen können." tint>
        <div className="grid items-start gap-8 md:grid-cols-[1fr_1fr]">
          <div className="panel relative flex flex-col p-6 sm:p-7" aria-labelledby="pkg-family">
            <span className="sticker tilt-r absolute -top-3.5 right-5 text-sm">{FAMILY.status}</span>
            <h3 id="pkg-family" className="text-title !text-[1.75rem]">{FAMILY.name}</h3>
            <p className="text-small mt-1 text-muted">{FAMILY.seatsParents} Elternteil + {FAMILY.seatsChildren} Kind</p>
            <p className="mt-5 inline-flex w-fit rounded-[var(--radius-sm)] border-2 border-dashed border-[var(--warning-line)] bg-[var(--warning-bg)] px-3 py-2 text-base font-bold text-[var(--warning-fg)]" data-price-placeholder>{FAMILY.pricePlaceholder}</p>
            <ul className="mt-5 flex-1 space-y-2.5 text-[15px]">
              {FAMILY.features.map((f) => <li key={f} className="flex gap-2.5"><Check size={18} strokeWidth={2.8} aria-hidden className="mt-0.5 shrink-0 text-[var(--brand)]" />{f}</li>)}
            </ul>
            <ButtonLink href="#warteliste" full className="mt-7" icon={<ArrowRight size={16} strokeWidth={2.4} aria-hidden />}>Auf die Warteliste</ButtonLink>
          </div>
          <ul className="space-y-4 text-[15px] leading-relaxed">
            <li className="flex gap-3"><ShieldCheck size={20} strokeWidth={2.2} aria-hidden className="mt-0.5 shrink-0 text-[var(--brand)]" />Noch kein Kauf möglich: Der Zugang wird während der Startphase manuell freigeschaltet.</li>
            <li className="flex gap-3"><Users size={20} strokeWidth={2.2} aria-hidden className="mt-0.5 shrink-0 text-[var(--brand)]" />Jugendliche ohne Elternkonto können WendApply auch allein nutzen.</li>
            <li className="flex gap-3"><House size={20} strokeWidth={2.2} aria-hidden className="mt-0.5 shrink-0 text-[var(--brand)]" />Nutzt die Schule WendApply, bleibt der Schulzugang kostenlos und unverändert.</li>
          </ul>
        </div>
      </Section>

      <Section id="so-gehts" title={<>So funktioniert es: <span className="marker">vier Schritte</span></>} intro="Ohne Installation. WendApply läuft im Browser und lässt sich als App auf Handy und Computer installieren.">
        <ol className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map(({ icon: Icon, title: t, text }, i) => (
            <li key={t} className="panel relative p-6">
              <span aria-hidden className="num-big text-[var(--brand)]">{i + 1}</span>
              <h3 className="text-heading mt-3 flex items-center gap-2"><Icon size={20} strokeWidth={2.2} aria-hidden />{t}</h3>
              <p className="text-body mt-2 text-muted">{text}</p>
            </li>
          ))}
        </ol>
      </Section>

      <Section id="datenschutz" title="Datenschutz für Minderjährige" intro="WendApply arbeitet mit Daten von Jugendlichen. Darum gelten im Familienkonto strenge Regeln nach Schweizer DSG und DSGVO." tint>
        <Grid items={privacy} />
        <div className="mt-7 flex flex-wrap items-center gap-3">
          <ButtonLink href="/datenschutz-uebersicht" variant="secondary" icon={<ArrowRight size={16} strokeWidth={2.4} aria-hidden />}>Datenschutz im Überblick</ButtonLink>
          <ButtonLink href="/datenschutz-jugend" variant="ghost">Datenschutz für Jugendliche</ButtonLink>
          <ButtonLink href="/loeschkonzept" variant="ghost" icon={<Trash2 size={16} strokeWidth={2.2} aria-hidden />}>Löschkonzept</ButtonLink>
        </div>
      </Section>

      <Section id="fragen" title="Häufige Fragen von Familien">
        <div className="max-w-3xl">
          <Faq items={faq} />
          <p className="text-small mt-5 text-muted">Weitere Antworten: <Link className={link} href="/hilfe#familien">Hilfe für Familien</Link></p>
        </div>
      </Section>

      <Section id="warteliste" title={<>Auf die Warteliste / <span className="marker">Zugang anfragen</span></>} intro="Wir starten mit wenigen Familien. Trag dich ein, dann melden wir uns, sobald ein Platz frei ist und der Preis feststeht." tint>
        <div className="max-w-2xl">
          <WaitlistForm kind={WAITLIST_KIND_FAMILY} mailFallback={MAIL_FAMILY} />
        </div>
      </Section>

      <CtaBand title="Fragen zu WendApply für Familien?" text="Schreib uns. Wir erklären gern, wie WendApply funktioniert und was Eltern sehen und was nicht.">
        <ButtonLink href={MAIL_FAMILY} size="lg" icon={<Mail size={18} strokeWidth={2.2} aria-hidden />}>E-Mail schreiben</ButtonLink>
        <ButtonLink href="/anleitung" size="lg" variant="secondary" className="!border-[var(--outline-fill)]" icon={<ArrowRight size={18} strokeWidth={2.4} aria-hidden />}>Zur Anleitung</ButtonLink>
      </CtaBand>
    </PublicShell>
  );
}
