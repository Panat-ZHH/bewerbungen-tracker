import type { Metadata } from "next";
import Link from "next/link";
import { publicMetadata, publicBreadcrumb } from "@/lib/seo/pages";
import { JsonLd } from "@/components/seo/json-ld";
import { faqJsonLd } from "@/lib/seo/site";
import { PublicShell } from "@/components/public/public-shell";
import { ButtonLink, FinalCta } from "@/components/public/site-ui";
import { Faq } from "@/components/public/faq";
import { FAQ_ALL, FAQ_GROUPS } from "@/components/public/faq-content";
import { SIGNUP_HREF, TRIAL_DAYS } from "@/components/public/marketing";

export const metadata: Metadata = publicMetadata({ canonical: "/faq" });

/** FAQ before sign-up (copy deck §8). The FAQPage JSON-LD lives here; /hilfe keeps only its own support questions. */
export default function FaqPage() {
  return (
    <PublicShell>
      <JsonLd data={publicBreadcrumb("/faq")} />
      <JsonLd data={faqJsonLd(FAQ_ALL)} />
      <section aria-labelledby="faq-h" className="s-hero">
        <div className="s-wrap s-narrow">
          <span className="s-kicker">FAQ</span>
          <h1 id="faq-h" className="s-h1 s-h1-sm">Häufige Fragen</h1>
          <p className="s-lead">Deine Frage ist nicht dabei? Schau in der <Link className="s-link" href="/hilfe">Hilfe</Link> nach oder <Link className="s-link" href="/kontakt">schreib uns</Link>.</p>
          <nav aria-label="Themen" className="s-chips">
            {FAQ_GROUPS.map((g) => <a key={g.id} className="s-chip" href={`#${g.id}`}>{g.title}</a>)}
          </nav>
          {FAQ_GROUPS.map((g) => (
            <section key={g.id} id={g.id} aria-labelledby={`${g.id}-h`} style={{ marginTop: 56, scrollMarginTop: 88 }}>
              <h2 id={`${g.id}-h`} className="s-h2" style={{ fontSize: "1.5rem", marginBottom: 12 }}>{g.title}</h2>
              <Faq items={g.items} />
            </section>
          ))}
        </div>
      </section>
      <FinalCta title="Bereit für die erste Bewerbung?" text={`Die ersten ${TRIAL_DAYS} Tage sind gratis, ohne Zahlungsangaben.`}>
        <ButtonLink href={SIGNUP_HREF} size="lg">Kostenlos testen</ButtonLink>
        <ButtonLink href="/kontakt" size="lg" variant="secondary">Kontakt</ButtonLink>
      </FinalCta>
    </PublicShell>
  );
}
