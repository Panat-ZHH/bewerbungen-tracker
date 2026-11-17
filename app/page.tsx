import type { Metadata } from "next";
import Link from "next/link";
import { publicMetadata } from "@/lib/seo/pages";
import { JsonLd } from "@/components/seo/json-ld";
import { homeJsonLd } from "@/lib/seo/site";
import { PublicShell } from "@/components/public/public-shell";
import { AuthRedirect } from "@/components/public/auth-redirect";
import { BrowserShot, ButtonLink, Checks, FinalCta, MoreLink, PhoneShot, Shot, SiteSection, Steps } from "@/components/public/site-ui";
import { Faq } from "@/components/public/faq";
import { pickFaq } from "@/components/public/faq-content";
import { LOGIN_HREF, PILOT, SIGNUP_HREF, TRIAL_DAYS } from "@/components/public/marketing";

export const metadata: Metadata = publicMetadata({ canonical: "/" });

const steps = [
  { title: "Stellen finden und merken", text: "Such Lehrstellen und Schnupperlehren von Yousty, jobs.ch und jobup.ch auf einmal. Was dich interessiert, merkst du mit einem Tipp." },
  { title: "Bewerbungen im Griff", text: "Jede Bewerbung hat ihren Status, ihre Frist und deine Notizen. WendApply erinnert dich, bevor eine Frist abläuft." },
  { title: "Dranbleiben", text: "Jede Bewerbung baut ein Haus in deinem Dorf. Und wenn du willst, sehen deine Lehrperson oder deine Eltern deinen Fortschritt." },
];

const audiences = [
  { title: "Für dich", text: "Alle Bewerbungen, Fristen und Dokumente an einem Ort. Du entscheidest, wer was sieht.", href: "/funktionen", link: "Funktionen" },
  { title: "Für Eltern", text: "Sehen, wo dein Kind steht, ohne täglich nachzufragen. Dein Kind entscheidet, was es teilt.", href: "/familien", link: "Für Eltern" },
  { title: "Für Lehrpersonen", text: "Den Fortschritt der Klasse auf einen Blick. Ohne zusätzliche Listen.", href: "/schulen#lehrpersonen", link: "Für Lehrpersonen" },
  { title: "Für Schulen", text: `Eine Schullizenz für die ganze Schule. Für Schülerinnen und Schüler gratis. Testen im ${PILOT.days}-Tage-Pilot.`, href: "/schulen", link: "Für Schulen" },
];

const trust = [
  { title: "Du bestimmst, was geteilt wird", text: "Vor dem Klassenbeitritt siehst du genau, was deine Lehrperson sieht. Notizen und Dokumente bleiben immer privat." },
  { title: "Datenbank in der EU", text: "Deine Daten liegen in einem Rechenzentrum in Irland. Welche Dienstleister beteiligt sind, steht auf der Seite Hosting." },
  { title: "Keine Werbung, kein Tracking", text: "WendApply zeigt keine Werbung, nutzt keine Analyse-Tracker und verkauft keine Daten." },
  { title: "Jederzeit löschen", text: "Du kannst deine Daten exportieren und dein Konto in den Einstellungen selbst löschen." },
];

const faq = pickFaq(["Was kostet WendApply?", "Was sieht meine Lehrperson?", "Was passiert nach der Gratis-Testwoche?"]);

export default function LandingPage() {
  return (
    <PublicShell>
      <JsonLd data={homeJsonLd()} />
      <AuthRedirect />

      <section aria-labelledby="hero-h" className="s-hero">
        <div className="s-wrap s-grid-2 s-wide-left">
          <div>
            <span className="s-kicker">Für die Lehrstellensuche in der Schweiz</span>
            <h1 id="hero-h" className="s-h1">Von der ersten Bewerbung bis zur <span className="s-hl">Zusage</span>.</h1>
            <p className="s-lead">Stellen finden, Bewerbungen und Fristen an einem Ort festhalten und dranbleiben. Allein, mit deinen Eltern oder mit deiner Klasse.</p>
            <div className="s-actions">
              <ButtonLink href={SIGNUP_HREF} size="lg">Kostenlos testen</ButtonLink>
              <ButtonLink href={LOGIN_HREF} size="lg" variant="secondary">Anmelden</ButtonLink>
            </div>
            <p className="s-small s-hero-note">{TRIAL_DAYS} Tage gratis, ohne Zahlungsangaben. Hat deine Schule eine Schullizenz, ist WendApply für dich gratis.</p>
            <p className="s-small" style={{ marginTop: 8 }}>Lehrperson oder Schule? <Link className="s-link" href="/schulen">Für Schulen</Link></p>
          </div>
          <div className="s-hero-visual">
            <PhoneShot name="m-search" small alt="" className="s-phone-back" />
            <PhoneShot name="m-dashboard" priority alt="Startseite von WendApply: der Weg zur Lehrstelle mit gemerkten und abgeschickten Bewerbungen, Gesprächen und Zusagen und den nächsten Fristen" />
          </div>
        </div>
      </section>

      <SiteSection id="so-gehts" kicker="In drei Schritten" title="So funktioniert es">
        <Steps items={steps} />
        <div className="s-actions" style={{ marginTop: 40 }}>
          <MoreLink href="/funktionen">Alle Funktionen ansehen</MoreLink>
          <MoreLink href="/anleitung">Zur Anleitung</MoreLink>
        </div>
      </SiteSection>

      <SiteSection id="fuer-wen" title="Für alle, die bei der Lehrstellensuche mithelfen">
        <ul className="s-cols s-cols-4">
          {audiences.map((a) => (
            <li key={a.title}>
              <h3 className="s-h3">{a.title}</h3>
              <p className="s-text">{a.text}</p>
              <MoreLink href={a.href}>{a.link}</MoreLink>
            </li>
          ))}
        </ul>
      </SiteSection>

      <section id="schueler" aria-labelledby="schueler-h" className="s-section">
        <div className="s-wrap s-grid-2">
          <div>
            <span className="s-kicker">Für Schülerinnen und Schüler</span>
            <h2 id="schueler-h" className="s-h2">Finden, bewerben, dranbleiben</h2>
            <p className="s-lead">Du suchst eine Lehrstelle oder eine Schnupperlehre? WendApply hält deine Bewerbungen zusammen, auch wenn es viele werden.</p>
            <Checks items={["Stellen aus mehreren Stellenbörsen in einer Suche", "Lehrbetriebe auf der Karte finden", "Status, Frist und Notizen für jede Bewerbung", "Erinnerungen per E-Mail oder als Benachrichtigung"]} />
          </div>
          <Shot center caption="Eine Suche, mehrere Stellenbörsen: Yousty, jobs.ch und jobup.ch.">
            <PhoneShot name="m-search" alt="Lehrstellensuche in WendApply: Suche nach Informatik-Lehrstellen mit Filtern für Ort und Umkreis und Treffern aus mehreren Stellenbörsen" />
          </Shot>
        </div>
      </section>

      <section id="lehrpersonen" aria-labelledby="lehrpersonen-h" className="s-section s-section-tint">
        <div className="s-wrap s-grid-2 s-flip">
          <div>
            <span className="s-kicker">Für Lehrpersonen</span>
            <h2 id="lehrpersonen-h" className="s-h2">Den Fortschritt der Klasse sehen, ohne nachzufragen</h2>
            <p className="s-lead">Die Übersicht zeigt, wer wo steht. Gezählt wird nur, was Schülerinnen und Schüler ausdrücklich freigeben.</p>
            <Checks items={["Klasse erstellen und per Link, Klassencode oder QR-Code einladen", "Sehen, wer Unterstützung braucht, ohne zusätzliche Listen", "Fristen und Mitteilungen an die ganze Klasse"]} />
            <div className="s-actions">
              <ButtonLink href="/schulen" variant="secondary">Für Schulen</ButtonLink>
              <MoreLink href="/preise#schulen">Preise</MoreLink>
            </div>
          </div>
          <Shot caption="Die Klassenübersicht zeigt nur freigegebene Angaben.">
            <BrowserShot name="24-teacher-dashboard" alt="Übersicht für Lehrpersonen: Bewerbungen, Gespräche und Zusagen der Klasse, wer Unterstützung braucht, und die Klassenliste" />
          </Shot>
        </div>
      </section>

      <SiteSection id="vertrauen" kicker="Datenschutz" title="Deine Daten gehören dir">
        <ul className="s-cols">
          {trust.map((t) => <li key={t.title}><h3 className="s-h3">{t.title}</h3><p className="s-text">{t.text}</p></li>)}
        </ul>
        <p className="s-small" style={{ marginTop: 24 }}>Mehr dazu: <Link className="s-link" href="/datenschutz-uebersicht">Datenschutz im Überblick</Link> · <Link className="s-link" href="/datenschutz-jugend">Datenschutz einfach erklärt</Link></p>
      </SiteSection>

      <section id="fragen" aria-labelledby="fragen-h" className="s-section">
        <div className="s-wrap s-grid-2" style={{ alignItems: "start" }}>
          <div>
            <h2 id="fragen-h" className="s-h2">Häufige Fragen</h2>
            <p className="s-lead">Kosten, Testwoche und wer was sieht: das Wichtigste in Kürze.</p>
            <div className="s-actions"><MoreLink href="/faq">Alle Fragen</MoreLink></div>
          </div>
          <Faq items={faq} />
        </div>
      </section>

      <FinalCta title="Bereit für die erste Bewerbung?" text={`Ein Konto ist in einer Minute erstellt. Die ersten ${TRIAL_DAYS} Tage sind gratis.`}>
        <ButtonLink href={SIGNUP_HREF} size="lg">Kostenlos testen</ButtonLink>
        <ButtonLink href="/schulen" size="lg" variant="secondary">Für Schulen</ButtonLink>
      </FinalCta>
    </PublicShell>
  );
}
