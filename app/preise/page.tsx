import type { Metadata } from "next";
import Link from "next/link";
import { publicMetadata, publicBreadcrumb } from "@/lib/seo/pages";
import { JsonLd } from "@/components/seo/json-ld";
import { faqJsonLd, pricingJsonLd } from "@/lib/seo/site";
import { PublicShell } from "@/components/public/public-shell";
import { ButtonLink, Checks, FinalCta, MoreLink, PageHero, SiteSection } from "@/components/public/site-ui";
import { Faq, type FaqItem } from "@/components/public/faq";
import { FAMILY, LOGIN_HREF, MAIL, PACKAGES, PILOT, SIGNUP_HREF, SOLO, TRIAL_DAYS, chf, perStudentMonth } from "@/components/public/marketing";
import { FREE_NOTICE, PAYMENT_LABEL, buyHref, familyPlan, intervalPriceText, onlinePaymentEnabled } from "@/components/billing/logic";
import { PLANS } from "@/lib/billing/plans";

export const metadata: Metadata = publicMetadata({ canonical: "/preise" });

const pro = PACKAGES.find((p) => p.recommended)!;
/** Online payment (feature flag, default off). Off = today's offer/contact flows plus the FREE_NOTICE note. */
const online = onlinePaymentEnabled();
const fam = familyPlan();
const pilotLimit = PLANS.pilot.studentLimit;

const faq: FaqItem[] = [
  { q: "Müssen Schülerinnen und Schüler etwas bezahlen?", a: "Mit Schullizenz nicht: Dann bezahlt die Schule, die Gemeinde oder der Schulträger. Ohne Schullizenz gibt es nach der Gratis-Testwoche das Einzelabo oder das Familienpaket." },
  { q: "Wie kündige ich ein Abo?", a: "Unter «Abo verwalten» in deinem Konto. Das Abo läuft bis zum Ende der bezahlten Zeit und verlängert sich dann nicht mehr." },
  { q: "Wie wird bei Schulen gezählt?", a: "Massgebend ist die Zahl der Schülerinnen und Schüler, die WendApply an Ihrer Schule nutzen. Lehrpersonen sind in allen Paketen inbegriffen." },
  { q: "Kann die Schule monatlich bezahlen?", a: "Die Schullizenz läuft jährlich. Andere Zahlungsrhythmen klären wir in der Offerte." },
  { q: "Können wir zuerst testen?", a: <>Ja, mit dem <Link href="/pilot">{PILOT.days}-Tage-Pilot</Link> für {PILOT.classes}. Er ist gratis und endet automatisch.</> },
  online
    ? { q: "Kann man online bestellen?", a: `Ja. Die Schuladministration wählt das Paket in WendApply im Bereich Schule und bezahlt mit ${PAYMENT_LABEL.card.title} oder auf ${PAYMENT_LABEL.invoice.title} (zahlbar innert 30 Tagen).` }
    : { q: "Kann man online bestellen?", a: "Noch nicht. Sie erhalten eine Offerte und einen Vertrag, wie bei Schulen üblich." },
];

export default function PreisePage() {
  return (
    <PublicShell>
      <JsonLd data={publicBreadcrumb("/preise")} />
      <JsonLd data={pricingJsonLd()} />
      <JsonLd data={faqJsonLd(faq)} />

      <PageHero id="preise-h" kicker="Preise" title={<>Einfache Preise. {TRIAL_DAYS} Tage gratis testen.</>}
        lead="Für dich und deine Familie gibt es zwei Abos. Schulen kaufen eine Schullizenz, dann ist WendApply für Schülerinnen und Schüler gratis.">
        <nav aria-label="Sprungmarken" className="s-chips" style={{ marginTop: 0 }}>
          <a className="s-chip" href="#familie">Für dich und deine Familie</a>
          <a className="s-chip" href="#schulen">Für Schulen</a>
        </nav>
      </PageHero>

      <section id="familie" aria-labelledby="familie-h" className="s-section">
        <span id="familien" aria-hidden />
        <div className="s-wrap">
          <div className="s-head">
            <h2 id="familie-h" className="s-h2">Für dich und deine Familie</h2>
          </div>
          <ul className="s-plans">
            <li className="s-plan" aria-labelledby="pkg-trial">
              <h3 id="pkg-trial" className="s-plan-name">Gratis-Testwoche</h3>
              <p className="s-small" style={{ margin: "4px 0 0" }}>Für Schülerinnen, Schüler und Eltern</p>
              <p className="s-price"><span className="s-price-num">CHF 0</span><span className="s-small">{TRIAL_DAYS} Tage</span></p>
              <Checks plain items={["Alle Funktionen", "Ohne Zahlungsangaben", "Endet automatisch, nichts wird belastet"]} />
              <div className="s-plan-cta"><ButtonLink href={SIGNUP_HREF} full>Kostenlos testen</ButtonLink></div>
            </li>
            <li className="s-plan" aria-labelledby="pkg-solo" data-testid="preise-solo">
              <h3 id="pkg-solo" className="s-plan-name">{SOLO.name}</h3>
              <p className="s-small" style={{ margin: "4px 0 0" }}>1 Schülerkonto</p>
              <p className="s-price" data-solo-price><span className="s-price-num">{SOLO.priceMonthText}</span><span className="s-small">pro Monat</span></p>
              <p className="s-small" style={{ margin: "6px 0 0" }}>oder {SOLO.priceYearText} pro Jahr (du sparst {SOLO.savingText})</p>
              <Checks plain items={["Alle Funktionen ohne Einschränkung", "Monatlich oder jährlich", "Kündbar auf Ende der Laufzeit"]} />
              <div className="s-plan-cta">{online
                ? <ButtonLink href={`${LOGIN_HREF}?next=%2Fabo`} variant="secondary" full>Abo wählen</ButtonLink>
                : <ButtonLink href={`${SIGNUP_HREF}?next=%2Fabo`} variant="secondary" full>Kostenlos testen</ButtonLink>}</div>
            </li>
            <li className="s-plan s-plan-featured" aria-labelledby="pkg-family">
              <span className="s-badge">Für Eltern</span>
              <h3 id="pkg-family" className="s-plan-name">{FAMILY.name}</h3>
              <p className="s-small" style={{ margin: "4px 0 0" }}>{FAMILY.seatsChildren} Schülerkonto + {FAMILY.seatsParents} Elternkonto</p>
              <p className="s-price" data-family-price><span className="s-price-num">{FAMILY.priceMonthText}</span><span className="s-small">pro Monat</span></p>
              <p className="s-small" style={{ margin: "6px 0 0" }}>oder {intervalPriceText(fam, "year")} (du sparst {FAMILY.savingText})</p>
              <Checks plain items={["Alle Funktionen für dein Kind", "Du siehst den Fortschritt, den dein Kind freigibt", "Kündbar auf Ende der Laufzeit"]} />
              <div className="s-plan-cta">
                {online
                  ? <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <ButtonLink href={buyHref("family", "year")} variant="sun" full>Jährlich buchen</ButtonLink>
                      <ButtonLink href={buyHref("family", "month")} variant="secondary" full>Monatlich buchen</ButtonLink>
                    </div>
                  : <ButtonLink href="/familien#warteliste" variant="sun" full>Auf die Warteliste</ButtonLink>}
              </div>
            </li>
          </ul>
          <p className="s-note" style={{ marginTop: 28 }}>Hat deine Schule eine Schullizenz? Dann brauchst du kein Abo. Tritt einfach der Klasse deiner Lehrperson bei.</p>
          <p role="note" data-billing-notice={online ? "on" : "off"} className="s-small" style={{ marginTop: 16 }}>
            {online ? "Bezahlt wird mit Karte. Die Quittung kommt per E-Mail." : FREE_NOTICE}
          </p>
        </div>
      </section>

      <section id="schulen" aria-labelledby="schulen-h" className="s-section s-section-tint">
        <div className="s-wrap">
          <div className="s-head">
            <span className="s-kicker">Schullizenz</span>
            <h2 id="schulen-h" className="s-h2">Für Schulen: eine Lizenz für die ganze Schule</h2>
            <p className="s-lead">Die Schule bezahlt eine Schullizenz pro Jahr nach Anzahl Schülerinnen und Schüler. Lehrpersonen sind immer inbegriffen. Im Paket {pro.name} sind das bei {pro.maxStudents} Schülerinnen und Schülern rund CHF {chf(perStudentMonth(pro), 2)} pro Person und Monat.</p>
          </div>
          <ul className="s-plans">
            {PACKAGES.map((p) => (
              <li key={p.id} className={`s-plan ${p.recommended ? "s-plan-featured" : ""}`} aria-labelledby={`pkg-${p.id}`}>
                {p.recommended && <span className="s-badge">Empfohlen</span>}
                <h3 id={`pkg-${p.id}`} className="s-plan-name">{p.name}</h3>
                <p className="s-small" style={{ margin: "4px 0 0" }}>{p.audience}</p>
                <p className="s-price"><span className="s-small">CHF</span><span className="s-price-num">{chf(p.pricePerYear)}</span><span className="s-small">pro Jahr</span></p>
                <p style={{ margin: "8px 0 0", fontWeight: 600 }}>bis {p.maxStudents} Schülerinnen und Schüler</p>
                <Checks plain items={p.features} />
                <div className="s-plan-cta">
                  {online && <ButtonLink href={buyHref(p.id)} variant={p.recommended ? "primary" : "secondary"} full aria-label={`${p.name} online abschliessen`}>Online abschliessen</ButtonLink>}
                  <ButtonLink href={MAIL.offer(p.name)} variant={online ? "ghost" : p.recommended ? "primary" : "secondary"} full aria-label={`Offerte für ${p.name} anfragen (E-Mail)`}>Offerte anfragen</ButtonLink>
                </div>
              </li>
            ))}
          </ul>
          <div className="s-band">
            <div>
              <h3 className="s-h3">Mehrere Schulhäuser oder ein Schulverband?</h3>
              <p className="s-text">Für Gemeinden, Schulträger und Verbände erstellen wir eine individuelle Offerte.</p>
            </div>
            <ButtonLink href={MAIL.multi} variant="secondary">Offerte anfragen</ButtonLink>
          </div>
          <div className="s-band">
            <div>
              <h3 className="s-h3">Zuerst testen: {PILOT.days}-Tage-Pilot</h3>
              <p className="s-text">Gratis mit {PILOT.classes}{pilotLimit ? ` und bis zu ${pilotLimit} Schülerinnen und Schülern` : ""}. Danach entscheiden Sie in einem gemeinsamen Gespräch.</p>
              <MoreLink href="/pilot">So läuft der Pilot</MoreLink>
            </div>
            <ButtonLink href={MAIL.pilot} variant="secondary">Pilot anfragen</ButtonLink>
          </div>
          <p className="s-small" style={{ marginTop: 24 }}>
            {online
              ? `Online mit ${PAYMENT_LABEL.card.title} oder auf ${PAYMENT_LABEL.invoice.title} (zahlbar innert 30 Tagen). Eine Offerte mit Vertrag ist weiterhin möglich.`
              : "Sie erhalten eine Offerte und einen Vertrag, inklusive Datenschutz-Dokumenten und AVV-Vorlage."}
          </p>
        </div>
      </section>

      <SiteSection id="fragen" title="Fragen zu den Preisen" narrow>
        <Faq items={faq} />
        <p className="s-small" style={{ marginTop: 24 }}>Weitere Antworten: <Link className="s-link" href="/faq">Häufige Fragen</Link></p>
      </SiteSection>

      <FinalCta title="Noch Fragen zu den Preisen?" text="Schreib uns oder probier WendApply einfach aus.">
        <ButtonLink href={SIGNUP_HREF} size="lg">Kostenlos testen</ButtonLink>
        <ButtonLink href="/kontakt" size="lg" variant="secondary">Kontakt</ButtonLink>
      </FinalCta>
    </PublicShell>
  );
}
