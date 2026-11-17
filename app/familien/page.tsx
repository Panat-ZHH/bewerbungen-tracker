import type { Metadata } from "next";
import Link from "next/link";
import { publicMetadata, publicBreadcrumb } from "@/lib/seo/pages";
import { JsonLd } from "@/components/seo/json-ld";
import { faqJsonLd } from "@/lib/seo/site";
import { PublicShell, Section } from "@/components/public/public-shell";
import { ButtonLink, Checks, FinalCta, PageHero, PhoneShot, Shot, SiteSection, Steps } from "@/components/public/site-ui";
import { Faq, type FaqItem } from "@/components/public/faq";
import { pickFaq } from "@/components/public/faq-content";
import { WaitlistForm } from "@/components/public/waitlist-form";
import { FAMILY, MAIL_FAMILY, SIGNUP_HREF, WAITLIST_KIND_FAMILY } from "@/components/public/marketing";
import { buyHref, onlinePaymentEnabled } from "@/components/billing/logic";

/** Online payment (feature flag, default off). */
const online = onlinePaymentEnabled();
/** Flag on: every family CTA leads to the parent page with yearly preselected (BILLING-FLOW-SPEC S5). */
const FAMILY_BUY_HREF = buyHref("family", "year");
/** "bald verfügbar" only while the flag is off (S7). */
const FAMILY_STATUS = online ? "online buchbar" : FAMILY.status;

export const metadata: Metadata = publicMetadata({ canonical: "/familien" });

const benefits = [
  { title: "Den Fortschritt kennen", text: "Du siehst, wie viele Bewerbungen laufen und welchen Status sie haben, soweit dein Kind das teilt." },
  { title: "Gezielt helfen", text: "Fristen und nächste Schritte sind sichtbar. So weisst du, wann Hilfe beim Brief oder bei der Vorbereitung aufs Gespräch nützt." },
  { title: "Motivation statt Druck", text: "Dorf und Fortschritt machen kleine Erfolge sichtbar, auch nach einer Absage." },
];

const steps = [
  { title: "Konto erstellen", text: "Du oder dein Kind erstellt ein Konto. Wir fragen nur das Geburtsjahr, nicht das genaue Datum." },
  { title: "Kind einladen", text: "Du erstellst einen Einladungscode. Er gilt 7 Tage und nur einmal. Dein Kind kann umgekehrt auch dich einladen." },
  { title: "Einwilligung", text: "Ist dein Kind unter 16, gibst du die Einwilligung. Erst dann wird geteilt, was dein Kind freigibt." },
  { title: "Fortschritt sehen", text: "Standardmässig siehst du Fortschritt und Dorf. Die Liste der Bewerbungen nur, wenn dein Kind sie freigibt." },
];

const faq: FaqItem[] = [
  ...pickFaq(["Wie funktioniert die Gratis-Testwoche?", "Was passiert nach der Gratis-Testwoche?", "Wo liegen meine Daten?", "Was passiert mit meinem Brief beim Bewerbungs-Check?"]),
  { q: "Kann ich später ein zweites Kind hinzufügen?", a: "Das Familienpaket gilt für 1 Elternteil und 1 Kind. Weitere Kinder und ein zweites Elternteil sind geplant, aber noch nicht möglich." },
];

export default function FamilienPage() {
  return (
    <PublicShell>
      <JsonLd data={publicBreadcrumb("/familien")} />
      <JsonLd data={faqJsonLd(faq)} />

      <PageHero id="familien-h" kicker="Für Eltern" title="Begleiten statt kontrollieren"
        lead="Die Lehrstellensuche ist für die ganze Familie eine intensive Zeit. Mit WendApply siehst du, wo dein Kind steht. Was du siehst, entscheidet dein Kind."
        note="7 Tage gratis für Schülerinnen, Schüler und Eltern, ohne Zahlungsangaben."
        visualDesktopOnly
        visual={<Shot center caption="So sieht es ein Elternkonto: nur, was das Kind freigibt."><PhoneShot name="m-familie" alt="Familienbereich in WendApply aus Sicht der Eltern: das Kind mit erteilter Zustimmung und der Überblick über seine Bewerbungen, nur mit den Angaben, die das Kind teilt" /></Shot>}>
        {online ? <ButtonLink href={FAMILY_BUY_HREF} size="lg">Familienpaket buchen</ButtonLink> : <ButtonLink href={SIGNUP_HREF} size="lg">Kostenlos testen</ButtonLink>}
        <ButtonLink href="/preise#familie" size="lg" variant="secondary">Preise ansehen</ButtonLink>
      </PageHero>

      <SiteSection id="eltern" title="Was du davon hast">
        <ul className="s-cols s-cols-3">
          {benefits.map((b) => <li key={b.title}><h3 className="s-h3">{b.title}</h3><p className="s-text">{b.text}</p></li>)}
        </ul>
        <div className="s-mobile-only">
          <Shot center caption="So sieht es ein Elternkonto: nur, was das Kind freigibt.">
            <PhoneShot name="m-familie" alt="Familienbereich in WendApply aus Sicht der Eltern: das Kind mit erteilter Zustimmung und der Überblick über seine Bewerbungen" />
          </Shot>
        </div>
      </SiteSection>

      <SiteSection id="so-gehts" kicker="In vier Schritten" title="So funktioniert es" tint>
        <Steps items={steps} cols={4} />
      </SiteSection>

      <SiteSection id="sichtbarkeit" title="Was du siehst und was nicht">
        <div className="s-grid-2" style={{ alignItems: "start" }}>
          <div>
            <h3 className="s-h3">Sichtbar</h3>
            <Checks items={["Anzahl und Status der Bewerbungen", "Das Dorf", "Die Bewerbungsliste, wenn dein Kind sie freigibt"]} />
          </div>
          <div>
            <h3 className="s-h3">Nie sichtbar</h3>
            <Checks no items={["Notizen", "Dokumente wie Lebenslauf und Zeugnisse", "Die Klasse und die Mitschülerinnen und Mitschüler", "Andere Familien"]} />
          </div>
        </div>
        <p className="s-lead">Dein Kind kann das Teilen jederzeit beenden. Dann siehst du nichts mehr, und alle Daten bleiben bei deinem Kind.</p>
      </SiteSection>

      <section id="familienpaket" aria-labelledby="familienpaket-h" className="s-section s-section-tint">
        <div className="s-wrap s-grid-2" style={{ alignItems: "start" }}>
          <div>
            <span className="s-kicker">Preis</span>
            <h2 id="familienpaket-h" className="s-h2">Das {FAMILY.name}</h2>
            <p className="s-lead">Nutzt die Schule deines Kindes WendApply schon mit Schullizenz, ist WendApply für dein Kind gratis.</p>
            <p className="s-small" style={{ marginTop: 16 }}>Alle Preise und das Einzelabo: <Link className="s-link" href="/preise#familie">Preise</Link></p>
          </div>
          <div className="s-plan s-plan-featured" aria-labelledby="pkg-family">
            <span className="s-badge">{FAMILY_STATUS}</span>
            <h3 id="pkg-family" className="s-plan-name">{FAMILY.name}</h3>
            <p className="s-small" style={{ margin: "4px 0 0" }}>{FAMILY.seatsChildren} Schülerkonto + {FAMILY.seatsParents} Elternkonto</p>
            <p className="s-price" data-family-price><span className="s-price-num">{FAMILY.priceMonthText}</span><span className="s-small">pro Monat</span></p>
            <p className="s-small" style={{ margin: "6px 0 0" }}>oder {FAMILY.priceYearText} pro Jahr (du sparst {FAMILY.savingText})</p>
            <Checks plain items={["Alle Funktionen für dein Kind", "Du siehst den Fortschritt, den dein Kind freigibt", "Kündbar auf Ende der Laufzeit"]} />
            <div className="s-plan-cta">
              {online ? <ButtonLink href={FAMILY_BUY_HREF} full>Familienpaket buchen</ButtonLink> : <ButtonLink href="#warteliste" full>Auf die Warteliste</ButtonLink>}
            </div>
          </div>
        </div>
      </section>

      <SiteSection id="datenschutz" title="Datenschutz für Minderjährige">
        <Checks items={[
          "Nur nötige Daten: Name, E-Mail und Geburtsjahr.",
          "Einwilligung der Eltern für Kinder unter 16, bevor etwas geteilt wird.",
          "Keine Werbung, kein Verkauf von Daten. Für Eltern- und Kinderkonten gleich.",
          "Alle können ihre Daten exportieren, die Familie verlassen und ihr Konto löschen.",
        ]} />
        <p className="s-small" style={{ marginTop: 24 }}>Mehr dazu: <Link className="s-link" href="/datenschutz-uebersicht">Datenschutz im Überblick</Link> · <Link className="s-link" href="/datenschutz-jugend">Datenschutz für Jugendliche</Link> · <Link className="s-link" href="/loeschkonzept">Löschkonzept</Link></p>
      </SiteSection>

      <SiteSection id="fragen" title="Häufige Fragen von Eltern" narrow>
        <Faq items={faq} />
        <p className="s-small" style={{ marginTop: 24 }}>Weitere Antworten: <Link className="s-link" href="/faq">Alle Fragen</Link></p>
      </SiteSection>

      {!online && (
        <Section id="warteliste" title="Auf die Warteliste" intro="Wir starten mit wenigen Familien. Trag dich ein, dann melden wir uns, sobald ein Platz frei ist." tint>
          <div style={{ maxWidth: 640 }}>
            <WaitlistForm kind={WAITLIST_KIND_FAMILY} mailFallback={MAIL_FAMILY} />
          </div>
        </Section>
      )}

      <FinalCta title="Fragen zu WendApply für Familien?" text="Schreib uns. Wir erklären gern, was Eltern sehen und was nicht.">
        <ButtonLink href={SIGNUP_HREF} size="lg">Kostenlos testen</ButtonLink>
        <ButtonLink href="/kontakt" size="lg" variant="secondary">Kontakt</ButtonLink>
      </FinalCta>
    </PublicShell>
  );
}
