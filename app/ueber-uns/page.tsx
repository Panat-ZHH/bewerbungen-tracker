import type { Metadata } from "next";
import Link from "next/link";
import { publicMetadata, publicBreadcrumb } from "@/lib/seo/pages";
import { JsonLd } from "@/components/seo/json-ld";
import { PublicShell } from "@/components/public/public-shell";
import { ButtonLink, Checks, FinalCta } from "@/components/public/site-ui";
import { CONTACT_EMAIL, SIGNUP_HREF, TRIAL_DAYS } from "@/components/public/marketing";

export const metadata: Metadata = publicMetadata({ canonical: "/ueber-uns" });

export default function UeberUnsPage() {
  return (
    <PublicShell>
      <JsonLd data={publicBreadcrumb("/ueber-uns")} />
      <article aria-labelledby="ueber-h" className="s-hero">
        <div className="s-wrap s-narrow">
          <span className="s-kicker">Über uns</span>
          <h1 id="ueber-h" className="s-h1 s-h1-sm">Wer hinter WendApply steht</h1>
          <p className="s-lead">WendApply ist ein Angebot von Wendico, einer Kollektivgesellschaft aus Kleinandelfingen im Kanton Zürich. Wir entwickeln WendApply seit 2026.</p>
          <p className="s-lead">Bei der Lehrstellensuche schreiben Jugendliche oft Dutzende Bewerbungen, gehen schnuppern und warten auf Antworten. Den Überblick behalten sie meist in Heften, Listen und E-Mails. WendApply bringt das an einen Ort und macht Fortschritt sichtbar, für die Jugendlichen selbst und, wenn sie es wollen, für Eltern und Lehrpersonen.</p>

          <section aria-labelledby="werte-h" style={{ marginTop: 64 }}>
            <h2 id="werte-h" className="s-h2">Woran wir uns halten</h2>
            <Checks items={[
              "Die Jugendlichen entscheiden. Wer was sieht, legen sie selbst fest.",
              "Sinnvolle Schritte zählen, nicht die Menge. Punkte gibt es für Fortschritt, nie für Geld.",
              "Datensparsam. Keine Werbung, keine Analyse-Tracker, kein Verkauf von Daten.",
              "Schweizer Lehrstellensuche: Lehrstelle, Schnupperlehre, Multicheck. Ortsdaten von swisstopo, Stellen von Yousty, jobs.ch und jobup.ch.",
            ]} />
          </section>

          {/* Team section: only after Panat confirms names and form of representation (Impressum still marks them as to be confirmed). */}

          <section aria-labelledby="kontakt-h" style={{ marginTop: 64 }}>
            <h2 id="kontakt-h" className="s-h2">Kontakt</h2>
            <p className="s-lead">Fragen, Feedback oder Ideen? Schreib uns an <a className="s-link" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.</p>
            <p className="s-small" style={{ marginTop: 12 }}>Angaben zur Anbieterin: <Link className="s-link" href="/impressum">Impressum</Link></p>
          </section>
        </div>
      </article>
      <FinalCta title="Probier WendApply aus" text={`Die ersten ${TRIAL_DAYS} Tage sind gratis, ohne Zahlungsangaben.`}>
        <ButtonLink href={SIGNUP_HREF} size="lg">Kostenlos testen</ButtonLink>
      </FinalCta>
    </PublicShell>
  );
}
