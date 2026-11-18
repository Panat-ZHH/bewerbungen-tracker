import type { Metadata } from "next";
import { publicMetadata, publicBreadcrumb } from "@/lib/seo/pages";
import { JsonLd } from "@/components/seo/json-ld";
import Link from "next/link";
import { Mail } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { CONTACT_EMAIL, TextPage } from "@/components/public/public-shell";

export const metadata: Metadata = publicMetadata({ canonical: "/kontakt" });

export default function KontaktPage() {
  return (
    <TextPage title={<>Wir freuen uns auf Ihre <span className="marker">Nachricht</span></>} intro="Fragen, Feedback oder ein Pilot für Ihre Schule? Schreiben Sie uns, wir antworten in der Regel innert weniger Werktage.">
      <JsonLd data={publicBreadcrumb("/kontakt")} />
      <div className="panel max-w-md p-6">
        <h2 className="text-heading">E-Mail</h2>
        <p className="mt-2"><a className="font-semibold text-[var(--brand)] underline underline-offset-4" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a></p>
        <ButtonLink href={`mailto:${CONTACT_EMAIL}`} className="mt-4" icon={<Mail size={16} aria-hidden />}>E-Mail schreiben</ButtonLink>
      </div>
      <section aria-labelledby="anliegen"><h2 id="anliegen" className="text-heading">Wofür Sie uns schreiben können</h2>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-muted marker:text-[var(--brand)]">
          <li>Pilot für Ihre Schule: <Link className="underline underline-offset-4" href="/schulen">Für Schulen</Link></li>
          <li>Probleme bei der Anmeldung oder mit der App: zuerst <Link className="underline underline-offset-4" href="/hilfe">Hilfe</Link>, dann gerne per E-Mail</li>
          <li>Fragen zum Datenschutz oder Löschung von Daten: <Link className="underline underline-offset-4" href="/datenschutz">Datenschutzerklärung</Link></li>
        </ul></section>
      <p className="text-small text-muted">Anbieterin: siehe <Link className="underline underline-offset-4" href="/impressum">Impressum</Link>.</p>
    </TextPage>
  );
}
