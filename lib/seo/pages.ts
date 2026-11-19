/**
 * Title, meta description, social image and breadcrumb label of every indexable public page, in one place.
 * Titles are without the brand (the layout template appends " | WendApply", max. 60 characters in total);
 * descriptions are 140 to 160 characters. tests/seo.test.mjs checks both, plus that every sitemap path is listed here.
 * Swiss spelling only (ss, never the sharp s). Light keyword use only: no keyword stuffing, no new claims.
 */
import { FAMILY, PACKAGES, PILOT, SOLO, TRIAL_DAYS, chf } from "../../components/public/marketing.ts";
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
    description: `Lehrstellen finden, Bewerbungen und Fristen im Griff: WendApply für Schülerinnen, Schüler, Eltern und Sekundarschulen in der Schweiz. ${TRIAL_DAYS} Tage kostenlos testen.`,
    crumb: "Start",
  },
  "/funktionen": {
    title: "Funktionen: Lehrstellen suchen und bewerben",
    description: "Lehrstellen suchen, Bewerbungen und Fristen verwalten, Dokumente ablegen, Motivationsschreiben prüfen und den Fortschritt mit Klasse oder Eltern teilen.",
    crumb: "Funktionen",
  },
  "/faq": {
    title: "Häufige Fragen zu WendApply",
    description: "Antworten zu Kosten, Testwoche, Kündigung, Datenschutz, Klasse und Eltern: alles, was du vor dem Start mit WendApply wissen willst, kurz und klar erklärt.",
    crumb: "Häufige Fragen",
  },
  "/ueber-uns": {
    title: "Über uns: wer hinter WendApply steht",
    description: "WendApply ist ein Angebot der Wendico KLG aus Gütighausen. Warum wir einen Bewerbungs-Tracker für die Lehrstellensuche bauen und wie wir arbeiten.",
    crumb: "Über uns",
  },
  "/schulen": {
    title: "Für Schulen: Berufswahl in der Sek begleiten",
    description: `Klassenübersicht, Fristen und Mitteilungen für Lehrpersonen, eine Schullizenz für die Schule, ohne Kosten für Jugendliche. Demo oder ${PILOT.days}-Tage-Pilot anfragen.`,
    crumb: "Für Schulen",
    og: "schulen",
  },
  "/familien": {
    title: "Für Eltern: Lehrstellensuche begleiten",
    description: `Sieh, wo dein Kind bei der Lehrstellensuche steht, ohne täglich nachzufragen. Dein Kind entscheidet, was es teilt. Familienpaket ab ${FAMILY.priceMonthText} pro Monat.`,
    crumb: "Für Eltern",
    og: "familien",
  },
  "/preise": {
    title: "Preise für Familien und Schulen",
    description: `${TRIAL_DAYS} Tage kostenlos testen. Einzelabo ab ${SOLO.priceMonthText} pro Monat, Familienpaket ab ${FAMILY.priceMonthText} pro Monat. Schulen: Schullizenz ab CHF ${minPrice} pro Jahr, ${PILOT.days}-Tage-Pilot.`,
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
    title: "Hilfe zur App",
    description: "Erste Schritte, Klasse beitreten, Passwort vergessen, Bestätigungs-E-Mail fehlt: Antworten und Lösungen für die Arbeit mit WendApply im Alltag.",
    crumb: "Hilfe",
  },
  "/kontakt": {
    title: "Kontakt, Demo und Pilot",
    description: "Fragen zu WendApply, Feedback, eine Live-Demo oder ein Pilot für die Sekundarschule: So erreichst du das WendApply-Team per E-Mail, wir antworten rasch.",
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
