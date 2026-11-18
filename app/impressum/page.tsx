import type { Metadata } from "next";
import { publicMetadata, publicBreadcrumb } from "@/lib/seo/pages";
import { JsonLd } from "@/components/seo/json-ld";
import Link from "next/link";
import { CONTACT_EMAIL, TextPage } from "@/components/public/public-shell";

export const metadata: Metadata = publicMetadata({ canonical: "/impressum" });

export default function ImpressumPage() {
  return (
    <TextPage title="Impressum">
      <JsonLd data={publicBreadcrumb("/impressum")} />
      <section aria-labelledby="anbieter"><h2 id="anbieter" className="text-heading">Betreiberin und Verantwortliche</h2>
        <address className="mt-2 not-italic">Wendico KLG (Kollektivgesellschaft)<br />Im Hofacker 3<br />8478 Gütighausen<br />Schweiz</address></section>
      <section aria-labelledby="vertretung"><h2 id="vertretung" className="text-heading">Vertretungsberechtigte</h2>
        <p className="mt-2">Panat Ruangsri, Tim Biedermann</p></section>
      <section aria-labelledby="kontakt"><h2 id="kontakt" className="text-heading">Kontakt</h2>
        <p className="mt-2">E-Mail: <a className="text-[var(--brand)] underline underline-offset-4" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a><br />Telefon: <a className="text-[var(--brand)] underline underline-offset-4" href="tel:+41795041005">+41 79 504 10 05</a></p></section>
      <section aria-labelledby="register"><h2 id="register" className="text-heading">Unternehmens-Identifikationsnummer</h2>
        <p className="mt-2">UID: CHE-298.049.775<br />Nicht mehrwertsteuerpflichtig, es wird keine MWST erhoben.</p></section>
      <section aria-labelledby="haftung"><h2 id="haftung" className="text-heading">Haftungsausschluss</h2>
        <p className="mt-2 text-muted">Wir erstellen die Inhalte dieser Website mit Sorgfalt, übernehmen aber keine Gewähr für Richtigkeit, Vollständigkeit und Aktualität. Für Inhalte verlinkter externer Seiten sind ausschliesslich deren Betreiber verantwortlich. Stellenangaben stammen von Dritten.</p></section>
      <section aria-labelledby="urheberrecht"><h2 id="urheberrecht" className="text-heading">Urheberrecht</h2>
        <p className="mt-2 text-muted">Texte, Bilder und Gestaltung dieser Website gehören der Wendico KLG oder den genannten Rechteinhabern. Jede Verwendung ausserhalb des persönlichen Gebrauchs braucht unsere schriftliche Zustimmung.</p></section>
      <section aria-labelledby="datenquellen"><h2 id="datenquellen" className="text-heading">Datenquellen</h2>
        <p className="mt-2 text-muted">Ortsdaten: Bundesamt für Landestopografie swisstopo</p></section>
      <p className="text-small text-muted">Siehe auch: <Link className="underline underline-offset-4" href="/datenschutz">Datenschutzerklärung</Link></p>
    </TextPage>
  );
}
