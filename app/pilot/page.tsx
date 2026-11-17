import type { Metadata } from "next";
import Link from "next/link";
import { publicMetadata, publicBreadcrumb } from "@/lib/seo/pages";
import { JsonLd } from "@/components/seo/json-ld";
import { PublicShell } from "@/components/public/public-shell";
import { ButtonLink, Checks, FinalCta, PageHero, SiteSection, Steps } from "@/components/public/site-ui";
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
  "Datenschutz-Dokumente für die Schulleitung, inklusive AVV-Vorlage",
  "Kurze Auswertung von Nutzung und Rückmeldungen für das Abschlussgespräch",
  "Ansprechperson bei Wendico während des ganzen Pilots",
  "Gratis, ohne automatische Verlängerung",
];

export default function PilotPage() {
  return (
    <PublicShell>
      <JsonLd data={publicBreadcrumb("/pilot")} />
      <PageHero id="pilot-h" kicker={`${PILOT.days}-Tage-Pilot · ${PILOT.classes}`} title="Testen Sie WendApply im echten Unterricht."
        lead={`Der Pilot ist zeitlich begrenzt auf ${PILOT.days} Tage, läuft mit ${PILOT.classes} und endet mit einem vereinbarten Feedback- und Entscheidungsgespräch.${PILOT.free ? " Für den Pilot entstehen der Schule keine Lizenzkosten." : ""}`}>
        <ButtonLink href={MAIL.pilot} size="lg">Pilot anfragen</ButtonLink>
        <ButtonLink href={MAIL.demo} size="lg" variant="secondary">Zuerst eine Demo</ButtonLink>
      </PageHero>

      <SiteSection id="ablauf" kicker="In fünf Schritten" title="So läuft der Pilot" intro="Vom ersten Gespräch bis zur Entscheidung.">
        <Steps items={steps} cols={5} />
      </SiteSection>

      <SiteSection id="leistungen" title="Was Ihre Schule im Pilot bekommt" tint>
        <Checks items={gets} />
      </SiteSection>

      <SiteSection id="voraussetzungen" title="Was wir von Ihnen brauchen">
        <Checks items={[
          "Eine Lehrperson pro Pilotklasse, die WendApply im Berufswahlunterricht einsetzt.",
          "Eine Ansprechperson der Schulleitung für Datenschutz und Entscheidung.",
          "Information der Schülerinnen, Schüler und Eltern vor dem Start (Vorlage von uns).",
          "Zeit für das gemeinsame Feedback- und Entscheidungsgespräch am Ende des Pilots.",
        ]} />
        <p className="s-small" style={{ marginTop: 24 }}>Nach dem Pilot gibt es keine automatische Verlängerung. Die Preise der Schullizenz finden Sie unter <Link className="s-link" href="/preise#schulen">Preise</Link>, Datenschutz-Informationen unter <Link className="s-link" href="/datenschutz-uebersicht">Datenschutz im Überblick</Link>.</p>
      </SiteSection>

      <FinalCta title="Bereit für den Pilot?" text="Schreiben Sie uns kurz Schule, Stufe und gewünschten Start. Wir melden uns in der Regel innert weniger Werktage.">
        <ButtonLink href={MAIL.pilot} size="lg">Pilot anfragen</ButtonLink>
        <ButtonLink href="/schulen" size="lg" variant="secondary">Mehr für Schulen</ButtonLink>
      </FinalCta>
    </PublicShell>
  );
}
