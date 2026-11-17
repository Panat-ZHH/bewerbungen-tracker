import type { Metadata } from "next";
import Link from "next/link";
import { publicMetadata, publicBreadcrumb } from "@/lib/seo/pages";
import { JsonLd } from "@/components/seo/json-ld";
import { PublicShell } from "@/components/public/public-shell";
import { BrowserShot, ButtonLink, Checks, FinalCta, PageHero, PhoneShot, Shot, SiteSection, Steps } from "@/components/public/site-ui";
import { MAIL, PILOT } from "@/components/public/marketing";
import { onlinePaymentEnabled } from "@/components/billing/logic";

export const metadata: Metadata = publicMetadata({ canonical: "/schulen" });

/** Online payment flag only changes one sentence for the school administration. */
const online = onlinePaymentEnabled();

const teachers = [
  { title: "Klassenübersicht", text: "Bewerbungen, Schnupperlehren, Gespräche und Zusagen der Klasse auf einen Blick, soweit die Jugendlichen sie teilen." },
  { title: "Wer braucht Unterstützung?", text: "WendApply zeigt, wer länger nichts eingetragen hat oder bei wem eine Frist ansteht. So können Sie gezielt nachfragen." },
  { title: "Fristen und Mitteilungen", text: "Setzen Sie Fristen und schicken Sie Mitteilungen an die ganze Klasse." },
  { title: "Klassenziele", text: "Gemeinsame Ziele und ein Klassendorf. Vertrauliche Bewerbungsdetails sieht dabei niemand." },
  { title: "Einladen in einer Minute", text: "Per Einladungslink, Klassencode, QR-Code, E-Mail oder CSV-Liste. Auch mit Co-Lehrperson." },
  { title: "Export", text: "Klassendaten als CSV, zum Beispiel für Elterngespräche." },
];

const rollout = [
  { title: "Demo", text: "Wir zeigen WendApply live aus Sicht der Schülerinnen und Schüler und der Lehrpersonen, online oder vor Ort." },
  { title: "Pilot", text: `${PILOT.days} Tage gratis mit ${PILOT.classes}, begleitet von uns.` },
  { title: "Schullizenz", text: "Im Abschlussgespräch entscheiden Sie über die Schullizenz." },
];

export default function SchulenPage() {
  return (
    <PublicShell>
      <JsonLd data={publicBreadcrumb("/schulen")} />

      <PageHero id="schulen-h" kicker="Für Sekundarschulen und Lehrpersonen" title="Den Bewerbungsprozess der Klasse sehen, ohne Listen zu führen."
        lead="WendApply hilft Sekundarschulen, den Bewerbungsprozess ihrer Schülerinnen und Schüler übersichtlich zu begleiten. Lehrpersonen sehen, wer Unterstützung braucht, und die Jugendlichen bleiben selbst am Steuer."
        note={<>Für Lehrpersonen gibt es keine Gratis-Testwoche. Der Zugang läuft über die Schullizenz oder den {PILOT.days}-Tage-Pilot. <Link className="s-link" href="/preise#schulen">Preise für Schulen</Link></>}
        visual={<BrowserShot priority name="24-teacher-dashboard" alt="Übersicht für Lehrpersonen: Bewerbungen, Gespräche und Zusagen der Klasse, wer Unterstützung braucht, und die Klassenliste" />}>
        <ButtonLink href={MAIL.demo} size="lg">Demo vereinbaren</ButtonLink>
        <ButtonLink href="/pilot" size="lg" variant="secondary">Pilot anfragen</ButtonLink>
      </PageHero>

      <SiteSection id="lehrpersonen" kicker="Für Lehrpersonen" title="Die Klasse begleiten, ohne zusätzliche Listen">
        <ul className="s-cols s-cols-3">
          {teachers.map((t) => <li key={t.title}><h3 className="s-h3">{t.title}</h3><p className="s-text">{t.text}</p></li>)}
        </ul>
        <div style={{ marginTop: 48, display: "flex", justifyContent: "center" }}>
          <Shot center caption="Die Klassenübersicht: Fortschritt, offene Fristen und wer Aufmerksamkeit braucht.">
            <PhoneShot name="m-teacher" alt="Klassenübersicht auf dem Handy: Anzahl Schülerinnen und Schüler, Bewerbungen, Gespräche und Zusagen und wer Aufmerksamkeit braucht" />
          </Shot>
        </div>
      </SiteSection>

      <SiteSection id="schuladmin" title="Für die Schuladministration" tint>
        <Checks items={[
          "Eine Schullizenz für alle Klassen der Schule, Lehrpersonen inbegriffen.",
          "Lehrpersonen hinzufügen und entfernen, Belegung der Lizenz im Blick.",
          online ? "Online bezahlen mit Kreditkarte oder auf Rechnung." : "Offerte und Vertrag, wie bei Schulen üblich.",
        ]} />
      </SiteSection>

      <section id="schueler" aria-labelledby="schueler-h" className="s-section">
        <div className="s-wrap s-grid-2">
          <div>
            <span className="s-kicker">Für Schülerinnen und Schüler</span>
            <h2 id="schueler-h" className="s-h2">Eigeninitiative, die sichtbar wird</h2>
            <p className="s-lead">WendApply macht Fortschritt sichtbar und belohnt Eigeninitiative. Gezählt werden sinnvolle Schritte, nicht möglichst viele Bewerbungen.</p>
            <Checks items={["Stellen, Bewerbungen, Status, Fristen und Dokumente an einem Ort", "Jeder Schritt von der Schnupperlehre bis zum Lehrvertrag wird sichtbar", "Ein persönliches Dorf, das mit dem Fortschritt wächst"]} />
          </div>
          <Shot center caption="Die Startseite der Schülerinnen und Schüler.">
            <PhoneShot name="m-dashboard" alt="Startseite für Schülerinnen und Schüler: der Weg zur Lehrstelle mit Bewerbungen nach Status und den zuletzt geänderten Bewerbungen" />
          </Shot>
        </div>
      </section>

      <SiteSection id="datenschutz" kicker="Datenschutz" title="Datenschutz von Anfang an" intro="WendApply arbeitet mit Daten von Minderjährigen. Datenschutz ist deshalb Teil des Produkts." tint>
        <Checks items={[
          "Lehrpersonen sehen nur, was Schülerinnen und Schüler für die Klasse freigeben. Notizen, Lebenslauf und Dokumente bleiben immer privat.",
          "Mitschülerinnen und Mitschüler sehen keine Bewerbungsdetails.",
          "Rollen für Schülerinnen und Schüler, Lehrpersonen und Schuladministration. Die Zugriffsregeln gelten direkt in der Datenbank.",
          "Datenbank in der EU (Irland), verschlüsselte Übertragung (HTTPS), Löschkonzept und AVV-Vorlage.",
          "Keine Werbung, keine Analyse-Tracker.",
        ]} />
        <p className="s-small" style={{ marginTop: 24 }}>
          <Link className="s-link" href="/datenschutz-schulen">Datenschutz für Schulen</Link> · <Link className="s-link" href="/avv">AVV-Vorlage</Link> · <Link className="s-link" href="/loeschkonzept">Löschkonzept</Link> · <Link className="s-link" href="/hosting">Hosting</Link>
        </p>
        <p className="s-fine" style={{ marginTop: 12 }}>Die Datenschutz-Dokumente sind Entwürfe und werden rechtlich geprüft. Zertifizierungen haben wir keine.</p>
      </SiteSection>

      <SiteSection id="einfuehrung" kicker="In drei Schritten" title="So kommt WendApply an Ihre Schule">
        <Steps items={rollout} />
      </SiteSection>

      <FinalCta title="Lernen Sie WendApply live kennen." text="In der Demo sehen Sie beide Sichten. Danach klären wir, ob ein Pilot für Ihre Schule passt.">
        <ButtonLink href={MAIL.demo} size="lg">Demo vereinbaren</ButtonLink>
        <ButtonLink href={MAIL.pilot} size="lg" variant="secondary">Pilot anfragen</ButtonLink>
      </FinalCta>
    </PublicShell>
  );
}
