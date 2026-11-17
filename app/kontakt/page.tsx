import type { Metadata } from "next";
import Link from "next/link";
import { publicMetadata, publicBreadcrumb } from "@/lib/seo/pages";
import { JsonLd } from "@/components/seo/json-ld";
import { PublicShell } from "@/components/public/public-shell";
import { ButtonLink } from "@/components/public/site-ui";
import { CONTACT_EMAIL, MAIL } from "@/components/public/marketing";

export const metadata: Metadata = publicMetadata({ canonical: "/kontakt" });

/** Contact by e-mail only (there is no contact form or contact API; behaviour unchanged). */
export default function KontaktPage() {
  return (
    <PublicShell>
      <JsonLd data={publicBreadcrumb("/kontakt")} />
      <section aria-labelledby="kontakt-h" className="s-hero">
        <div className="s-wrap s-narrow">
          <span className="s-kicker">Kontakt</span>
          <h1 id="kontakt-h" className="s-h1 s-h1-sm">Kontakt</h1>
          <p className="s-lead">Eine E-Mail genügt. Wir antworten in der Regel innert weniger Werktage.</p>
          <ul className="s-boxes" style={{ marginTop: 48 }}>
            <li>
              <h2 className="s-h3">E-Mail</h2>
              <p className="s-text"><a className="s-link" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a></p>
              <div className="s-actions" style={{ marginTop: 16 }}><ButtonLink href={`mailto:${CONTACT_EMAIL}`}>E-Mail schreiben</ButtonLink></div>
            </li>
            <li>
              <h2 className="s-h3">Für Schulen</h2>
              <p className="s-text">Möchten Sie WendApply kennenlernen? Wir zeigen es Ihnen live und besprechen einen Pilot.</p>
              <div className="s-actions" style={{ marginTop: 16 }}>
                <ButtonLink href={MAIL.demo} variant="secondary">Demo vereinbaren</ButtonLink>
                <ButtonLink href={MAIL.pilot} variant="ghost">Pilot anfragen</ButtonLink>
              </div>
            </li>
            <li>
              <h2 className="s-h3">Hilfe zur App</h2>
              <p className="s-text">Probleme bei der Anmeldung oder mit der App? In der Hilfe findest du die häufigsten Lösungen.</p>
              <div className="s-actions" style={{ marginTop: 16 }}><ButtonLink href="/hilfe" variant="secondary">Zur Hilfe</ButtonLink></div>
            </li>
            <li>
              <h2 className="s-h3">Datenschutz</h2>
              <p className="s-text">Fragen zum Datenschutz oder zur Löschung von Daten: siehe <Link className="s-link" href="/datenschutz">Datenschutzerklärung</Link>.</p>
            </li>
          </ul>
          <p className="s-small" style={{ marginTop: 32 }}>Anbieterin: Wendico, Kleinandelfingen. Siehe <Link className="s-link" href="/impressum">Impressum</Link>.</p>
        </div>
      </section>
    </PublicShell>
  );
}
