import type { Metadata } from "next";
import Link from "next/link";
import { CONTACT_EMAIL, TextPage, Todo } from "@/components/public/public-shell";

export const metadata: Metadata = {
  title: "Impressum | WendApply",
  description: "Impressum von WendApply, einem Angebot von Wendico, Kleinandelfingen.",
  alternates: { canonical: "/impressum" },
  openGraph: { title: "Impressum | WendApply", type: "website", locale: "de_CH", siteName: "WendApply" },
};

export default function ImpressumPage() {
  return (
    <TextPage eyebrow="Rechtliches" title="Impressum">
      <section aria-labelledby="anbieter"><h2 id="anbieter" className="text-heading">Anbieterin</h2>
        <p className="mt-2">Wendico, Kollektivgesellschaft<br />Kleinandelfingen, Schweiz<br /><Todo>Strasse, PLZ und genauen Firmennamen bestätigen</Todo></p></section>
      <section aria-labelledby="vertretung"><h2 id="vertretung" className="text-heading">Vertretungsberechtigte</h2>
        <p className="mt-2">Panat Ruangsri, Tim Biedermann <Todo>Namen und Vertretungsform bestätigen</Todo></p></section>
      <section aria-labelledby="kontakt"><h2 id="kontakt" className="text-heading">Kontakt</h2>
        <p className="mt-2">E-Mail: <a className="text-[var(--brand)] underline underline-offset-4" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a><br />Telefon: <Todo>Telefonnummer angeben oder Zeile streichen</Todo></p></section>
      <section aria-labelledby="register"><h2 id="register" className="text-heading">Handelsregister und MWST</h2>
        <p className="mt-2">UID / Handelsregister-Nr.: <Todo>UID bestätigen</Todo><br />MWST-Nr.: <Todo>falls vorhanden</Todo></p></section>
      <section aria-labelledby="haftung"><h2 id="haftung" className="text-heading">Haftungsausschluss</h2>
        <p className="mt-2 text-muted">Wir erstellen die Inhalte dieser Website mit Sorgfalt, übernehmen aber keine Gewähr für Richtigkeit, Vollständigkeit und Aktualität. Für Inhalte verlinkter externer Seiten sind ausschliesslich deren Betreiber verantwortlich. Stellenangaben stammen von Dritten.</p></section>
      <p className="text-small text-muted">Siehe auch: <Link className="underline underline-offset-4" href="/datenschutz">Datenschutzerklärung</Link></p>
    </TextPage>
  );
}
