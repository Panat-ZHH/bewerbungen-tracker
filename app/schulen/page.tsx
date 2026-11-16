import type { Metadata } from "next";
import { publicMetadata, publicBreadcrumb } from "@/lib/seo/pages";
import { JsonLd } from "@/components/seo/json-ld";
import Link from "next/link";
import { ArrowRight, BarChart3, Eye, Flag, Footprints, House, LayoutList, LifeBuoy, ListChecks, Lock, Mail, Presentation, ShieldCheck, Trophy, Users } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { PublicShell, Section } from "@/components/public/public-shell";
import { Screenshot } from "@/components/public/screenshot";
import { CtaBand } from "@/components/public/cta-band";
import { MAIL, PILOT, POSITIONING, TAGLINE } from "@/components/public/marketing";

export const metadata: Metadata = publicMetadata({ canonical: "/schulen" });

type Item = { icon: typeof Eye; title: string; text: string };

const teachers: Item[] = [
  { icon: LayoutList, title: "Klassenübersicht", text: "Sie sehen auf einen Blick, wo die Klasse steht: Bewerbungen, Schnupperlehren, Gespräche und Zusagen, soweit die Jugendlichen sie teilen." },
  { icon: LifeBuoy, title: "Wer braucht Unterstützung?", text: "WendApply zeigt, wer länger nichts eingetragen hat oder bei wem eine Frist ansteht. So können Sie gezielt nachfragen." },
  { icon: Flag, title: "Gemeinsame Klassenziele", text: "Setzen Sie Ziele und Fristen für die ganze Klasse und verfolgen Sie, wie sie sich entwickeln." },
  { icon: BarChart3, title: "Statistiken", text: "Zusammengefasste Auswertungen für Lehrpersonen und Schulleitung, als Grundlage für Gespräche und Elternabende." },
  { icon: ListChecks, title: "Strukturierte Begleitung", text: "Mitteilungen, Fristen, kurze Erinnerungen und ein Verlauf pro Klasse. Ohne zusätzliche Excel-Listen." },
  { icon: Users, title: "Für das ganze Kollegium", text: "Klassen mit mehreren Lehrpersonen, Einladung per Link, Code, QR-Code oder CSV-Liste." },
];

const students: Item[] = [
  { icon: LayoutList, title: "Alles an einem Ort", text: "Stellen, Bewerbungen, Status, Fristen und Unterlagen in einer übersichtlichen Liste." },
  { icon: Footprints, title: "Fortschritt sehen", text: "Jeder Schritt von der Schnupperlehre bis zum Lehrvertrag wird sichtbar. Das hilft auch nach einer Absage weiterzumachen." },
  { icon: House, title: "Persönliches Dorf", text: "Jede Bewerbung wird zu einem Haus, das mit dem Fortschritt wächst. Belohnt werden sinnvolle Schritte, nicht möglichst viele Bewerbungen." },
  { icon: Trophy, title: "Klassendorf", text: "Gemeinsame Ziele und ein Dorf für die ganze Klasse. Mitschülerinnen und Mitschüler sehen keine vertraulichen Bewerbungsdetails." },
];

const rollout = [
  { icon: Presentation, title: "Demo", text: "Live-Demo aus Sicht der Schülerinnen und Schüler und der Lehrpersonen, online oder vor Ort." },
  { icon: Flag, title: `${PILOT.days}-Tage-Pilot`, text: `${PILOT.classes}, zeitlich begrenzt, mit vereinbartem Feedback- und Entscheidungsgespräch.` },
  { icon: ShieldCheck, title: "Jahreslizenz", text: "Lizenz für die ganze Schule nach Anzahl Schülerinnen und Schüler. Für die Jugendlichen kostenlos." },
];

const privacy = [
  "Lehrpersonen sehen nur, was Schülerinnen und Schüler für die Klasse freigeben. Notizen, Lebenslauf und Dokumente bleiben immer privat.",
  "Mitschülerinnen und Mitschüler sehen keine vertraulichen Bewerbungsdetails. Dorf und Klassenziele sind von den Bewerbungsdaten getrennt.",
  "Rollen für Schülerinnen und Schüler, Lehrpersonen und Schuladministration. Die Zugriffsregeln gelten direkt in der Datenbank.",
  "Datensparsam, verschlüsselte Übertragung (HTTPS), Datenbank in der EU (Irland), Löschkonzept und AVV-Vorlage.",
];

const link = "font-semibold text-[var(--brand)] underline decoration-2 underline-offset-4 hover:text-[var(--brand-strong)]";

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

export default function SchulenPage() {
  return (
    <PublicShell>
      <JsonLd data={publicBreadcrumb("/schulen")} />
      <section aria-labelledby="schulen-h" className="mx-auto grid w-full max-w-6xl items-center gap-12 overflow-x-clip px-4 pb-14 pt-10 sm:px-6 sm:pb-20 sm:pt-16 lg:grid-cols-[1.15fr_.85fr]">
        <div className="min-w-0">
          <p className="sticker sticker-paper tilt-l mb-5 text-sm">Für Sekundarschulen</p>
          <h1 id="schulen-h" className="animate-rise text-hero max-w-4xl hyphens-auto break-words">{TAGLINE.replace(" machen.", "")} <span className="marker [box-decoration-break:clone]">machen.</span></h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted">{POSITIONING}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonLink href={MAIL.demo} size="lg" icon={<Presentation size={18} strokeWidth={2.2} aria-hidden />}>Demo buchen</ButtonLink>
            <ButtonLink href="/pilot" size="lg" variant="secondary" icon={<ArrowRight size={18} strokeWidth={2.4} aria-hidden />}>{PILOT.days}-Tage-Pilot</ButtonLink>
          </div>
          <p className="text-small mt-5 text-muted">Lizenz für die Schule, kostenlos für Schülerinnen und Schüler. <Link className={link} href="/preise">Preise ansehen</Link></p>
        </div>
        <Screenshot name="24-teacher-dashboard" alt="Lehrpersonen-Übersicht mit Klassen, Bewerbungen und Fristen" width={1200} height={1042} priority className="tilt-r" />
      </section>

      <Section id="lehrpersonen" title="Für Lehrpersonen und Schulleitungen" intro="Den Stand der Klasse in der Berufswahl kennen, ohne Listen nachzuführen. Und dort unterstützen, wo es nötig ist." tint>
        <Grid items={teachers} />
      </Section>

      <Section id="schueler" title={<>Für Schülerinnen und Schüler: <span className="marker">dranbleiben lohnt sich</span></>} intro="WendApply macht Fortschritt sichtbar und belohnt Eigeninitiative. Nicht die Zahl der Bewerbungen zählt, sondern sinnvolle Schritte.">
        <div className="grid items-center gap-10 lg:grid-cols-[1fr_1fr]">
          <Grid items={students} cols="sm:grid-cols-2" />
          <Screenshot name="04-dashboard" alt="Übersicht für Schülerinnen und Schüler mit Bewerbungen, Status und Fristen" width={1200} height={978} className="tilt-l" />
        </div>
      </Section>

      <Section id="einfuehrung" title={<>So kommt WendApply <span className="marker">an Ihre Schule</span></>} intro="Drei Schritte, ohne Installation. WendApply läuft im Browser und lässt sich als App auf Handy und Computer installieren." tint>
        <ol className="grid gap-6 md:grid-cols-3">
          {rollout.map(({ icon: Icon, title: t, text }, i) => (
            <li key={t} className="panel relative p-6">
              <span aria-hidden className="num-big text-[var(--brand)]">{i + 1}</span>
              <h3 className="text-heading mt-3 flex items-center gap-2"><Icon size={20} strokeWidth={2.2} aria-hidden />{t}</h3>
              <p className="text-body mt-2 text-muted">{text}</p>
            </li>
          ))}
        </ol>
        <div className="mt-8 flex flex-wrap gap-3">
          <ButtonLink href="/pilot" variant="secondary" icon={<ArrowRight size={16} strokeWidth={2.4} aria-hidden />}>Ablauf des Pilots</ButtonLink>
          <ButtonLink href="/preise" variant="secondary" icon={<ArrowRight size={16} strokeWidth={2.4} aria-hidden />}>Preise</ButtonLink>
          <ButtonLink href="/anleitung#lehrpersonen" variant="ghost">Anleitung für Lehrpersonen</ButtonLink>
        </div>
      </Section>

      <Section id="datenschutz" title="Datenschutz von Anfang an" intro="WendApply arbeitet mit Daten von Minderjährigen. Datenschutz ist deshalb Teil des Produkts, nicht ein Anhang.">
        <ul className="grid max-w-4xl gap-x-10 gap-y-4 sm:grid-cols-2">
          {privacy.map((p, i) => {
            const I = [Eye, Lock, Users, ShieldCheck][i];
            return <li key={p} className="flex gap-3 text-[15px] leading-relaxed"><I size={20} strokeWidth={2.2} aria-hidden className="mt-0.5 shrink-0 text-[var(--brand)]" />{p}</li>;
          })}
        </ul>
        <div className="mt-7 flex flex-wrap items-center gap-3">
          <ButtonLink href="/datenschutz-uebersicht" variant="secondary" icon={<ArrowRight size={16} strokeWidth={2.4} aria-hidden />}>Datenschutz im Überblick</ButtonLink>
          <ButtonLink href="/datenschutz-schulen" variant="ghost">Datenschutz für Schulen</ButtonLink>
          <ButtonLink href="/avv" variant="ghost">AVV-Vorlage</ButtonLink>
        </div>
      </Section>

      <CtaBand title="Lernen Sie WendApply live kennen." text="In der Live-Demo sehen Sie die Sicht der Schülerinnen und Schüler und die der Lehrpersonen. Danach klären wir, ob ein Pilot für Ihre Schule passt.">
        <ButtonLink href={MAIL.demo} size="lg" icon={<Presentation size={18} strokeWidth={2.2} aria-hidden />}>Demo buchen</ButtonLink>
        <ButtonLink href={MAIL.offer()} size="lg" variant="secondary" className="!border-[var(--outline-fill)]" icon={<Mail size={18} strokeWidth={2.2} aria-hidden />}>Offerte anfragen</ButtonLink>
      </CtaBand>
    </PublicShell>
  );
}
