/**
 * Title, meta description, social image and breadcrumb label of every indexable public page, in one place.
 * Titles are without the brand (the layout template appends " | WendApply", max. 60 characters in total);
 * descriptions are 140 to 160 characters. tests/seo.test.mjs checks both, plus that every sitemap path is listed here.
 * Swiss spelling only (ss, never the sharp s). Light keyword use only: no keyword stuffing, no new claims.
 */
import { PACKAGES, PILOT, chf } from "../../components/public/marketing.ts";
import { breadcrumbJsonLd, pageMetadata, type OgImageKey } from "./site.ts";

export type PageSeo = {
  title: string;
  description: string;
  /** Label in the BreadcrumbList (Start > label). */
  crumb: string;
  og?: OgImageKey;
  type?: "website" | "article";
};

const minPrice = chf(Math.min(...PACKAGES.map((p) => p.pricePerYear)));

export const PAGE_SEO = {
  "/": {
    // Home uses the full title as is (brand at the end, no template).
    title: "Bewerbungs-Tracker für die Lehrstellensuche | WendApply",
    description: "Lehrstellen finden, Bewerbungen organisieren und Fristen im Blick: der Bewerbungs-Tracker für Schülerinnen, Schüler und Sekundarschulen in der Schweiz.",
    crumb: "Start",
  },
  "/schulen": {
    title: "Berufswahl an der Sekundarschule begleiten",
    description: `Den Bewerbungsprozess der Klasse sehen, ohne Listen nachzuführen: WendApply für Sekundarschulen. Klassenübersicht, Klassenziele, Demo und ${PILOT.days}-Tage-Pilot.`,
    crumb: "Für Schulen",
    og: "schulen",
  },
  "/familien": {
    title: "Lehrstellensuche als Familie begleiten",
    description: "WendApply für Eltern und Jugendliche: Bewerbungen, Fristen und Fortschritt bei der Lehrstellensuche im Blick. Das Kind entscheidet, was es teilt.",
    crumb: "Für Familien",
    og: "familien",
  },
  "/preise": {
    title: `Preise für Schulen: Jahreslizenz ab CHF ${minPrice}`,
    description: `WendApply für Sekundarschulen: Jahreslizenz ab CHF ${minPrice} nach Anzahl Schülerinnen und Schüler, Lehrpersonen und Schülerinnen und Schüler inbegriffen.`,
    crumb: "Preise",
  },
  "/pilot": {
    title: `${PILOT.days}-Tage-Pilot für Sekundarschulen`,
    description: `WendApply ${PILOT.days} Tage mit ${PILOT.classes} im Berufswahlunterricht testen: begleiteter Start, klarer Zeitrahmen und ein Feedback- und Entscheidungsgespräch.`,
    crumb: `${PILOT.days}-Tage-Pilot`,
  },
  "/anleitung": {
    title: "Anleitung: Bewerbungen organisieren",
    description: "Schritt für Schritt: Konto erstellen, Lehrstellen suchen, Bewerbungen und Fristen verwalten und WendApply als App auf Handy oder Computer installieren.",
    crumb: "Anleitung",
    type: "article",
  },
  "/hilfe": {
    title: "Hilfe und häufige Fragen",
    description: "Antworten zu WendApply: erste Schritte für Schülerinnen, Schüler und Lehrpersonen, Preise und Pilot für Schulen, Familien, Datenschutz und Anmeldung.",
    crumb: "Hilfe",
  },
  "/kontakt": {
    title: "Kontakt, Demo und Pilot-Anfrage",
    description: "So erreichen Sie das WendApply-Team: Fragen zur App, Feedback, eine Live-Demo oder ein Pilot für Ihre Sekundarschule. Wir antworten per E-Mail.",
    crumb: "Kontakt",
  },
  "/impressum": {
    title: "Impressum",
    description: "Impressum von WendApply, dem Bewerbungs-Tracker für die Lehrstellensuche. Ein Angebot der Wendico KLG aus Gütighausen, Schweiz, mit Kontaktangaben.",
    crumb: "Impressum",
  },
  "/datenschutz-uebersicht": {
    title: "Datenschutz im Überblick",
    description: "Wer in WendApply was sieht, welche Daten wir bearbeiten, wo sie liegen und wie Löschung und Export geregelt sind. Für Schulen, Jugendliche und Eltern.",
    crumb: "Datenschutz im Überblick",
  },
  "/datenschutz": {
    title: "Datenschutzerklärung",
    description: "Datenschutzerklärung von WendApply: welche Daten wir bei der Lehrstellensuche bearbeiten, warum, wer sie sieht, wo sie liegen und welche Rechte du hast.",
    crumb: "Datenschutzerklärung",
  },
  "/datenschutz-jugend": {
    title: "Datenschutz für Jugendliche",
    description: "Datenschutz einfach erklärt: was WendApply über dich speichert, wer deine Daten sehen kann, wo sie liegen und was du selbst tun darfst, etwa alles löschen.",
    crumb: "Datenschutz für Jugendliche",
  },
  "/datenschutz-schulen": {
    title: "Datenschutz für Schulen",
    description: "Datenschutz für Schulen und Lehrpersonen: Rollen, Rechtsrahmen nach DSG und DSGVO, Zugriffe und technische Massnahmen beim Einsatz von WendApply.",
    crumb: "Datenschutz für Schulen",
  },
  "/avv": {
    title: "Auftragsbearbeitung (AVV/DPA)",
    description: "Vorlage für die Vereinbarung zur Auftragsbearbeitung (AVV/DPA) zwischen Schulen und WendApply. Zum Lesen, Drucken und als Markdown-Datei zum Download.",
    crumb: "AVV-Vorlage",
  },
  "/hosting": {
    title: "Hosting und Unterauftragsbearbeiter",
    description: "Wo die Daten von WendApply liegen und welche Dienstleister beteiligt sind: Hosting, Datenbank in der EU, E-Mail und weitere Unterauftragsbearbeiter.",
    crumb: "Hosting",
  },
  "/loeschkonzept": {
    title: "Löschkonzept am Klassenende",
    description: "Löschkonzept von WendApply: was am Ende einer Klasse oder bei Kontolöschung wann gelöscht wird, wer es auslöst und was Schülerinnen und Schüler behalten.",
    crumb: "Löschkonzept",
  },
} satisfies Record<string, PageSeo>;

export type PublicPath = keyof typeof PAGE_SEO;

/** Metadata of a public page from PAGE_SEO: title, description, canonical, robots index, Open Graph, Twitter. */
export function publicMetadata({ canonical }: { canonical: PublicPath }) {
  const p: PageSeo = PAGE_SEO[canonical];
  return pageMetadata({ canonical, title: p.title, description: p.description, og: p.og, type: p.type, absoluteTitle: canonical === "/" });
}

/** BreadcrumbList JSON-LD for a public subpage (Start > page). */
export function publicBreadcrumb(path: Exclude<PublicPath, "/">) {
  return breadcrumbJsonLd([{ name: PAGE_SEO[path].crumb, path }]);
}
