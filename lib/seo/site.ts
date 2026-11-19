/**
 * SEO building blocks for the public marketing site: page metadata (canonical, Open Graph, Twitter) and JSON-LD.
 * Plain TS (relative imports with .ts) so node tests can import it directly.
 *
 * Indexing model: the root layout is noindex by default (covers every app route behind the login, even client
 * layouts that cannot export metadata). Public pages opt in through pageMetadata(), which sets robots to index.
 * The site is German (Switzerland) only, so there are no hreflang alternates on purpose.
 */
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { OFFER } from "./offer.ts";
import { CONTACT_EMAIL, PACKAGES } from "../../components/public/marketing.ts";
import { PLANS } from "../billing/plans.ts";

export const SITE_URL = "https://wendapply.ch";
export const SITE_NAME = "WendApply";
export const SITE_LOCALE = "de_CH";
export const SITE_LANG = "de-CH";

/** Social preview images (1200x630). The files in public/og are owned by the images work, this file only references them. */
export const OG_IMAGES = {
  default: { url: "/og/og-default.png", alt: "WendApply: Bewerbungen für die Lehrstelle im Blick behalten" },
  schulen: { url: "/og/og-schulen.png", alt: "WendApply für Schulen: Klassenübersicht für die Berufswahl" },
  familien: { url: "/og/og-familien.png", alt: "WendApply für Familien: Lehrstellensuche gemeinsam begleiten" },
} as const;
export type OgImageKey = keyof typeof OG_IMAGES;

export const INDEX = { index: true, follow: true } as const;
export const NOINDEX = { index: false, follow: false } as const;

/** Builds the full metadata of an indexable public page. `title` is without the brand (the layout template adds " | WendApply"). */
export function pageMetadata({ canonical, title, description, og = "default", type = "website", absoluteTitle = false }: {
  canonical: string;
  title: string;
  description: string;
  og?: OgImageKey;
  type?: "website" | "article";
  /** true = use the title as is (home page), false = append the brand via the layout template. */
  absoluteTitle?: boolean;
}): Metadata {
  const full = absoluteTitle ? title : `${title} | ${SITE_NAME}`;
  const image = { ...OG_IMAGES[og], width: 1200, height: 630, type: "image/png" };
  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    alternates: { canonical },
    robots: INDEX,
    openGraph: { type, url: canonical, siteName: SITE_NAME, locale: SITE_LOCALE, title: full, description, images: [image] },
    twitter: { card: "summary_large_image", title: full, description, images: [{ url: image.url, alt: image.alt }] },
  };
}

const abs = (path: string) => (path === "/" ? SITE_URL : `${SITE_URL}${path}`);

export const ORG_ID = `${SITE_URL}/#organization`;
export const WEBSITE_ID = `${SITE_URL}/#website`;
export const APP_ID = `${SITE_URL}/#app`;

/** Organization + WebSite + SoftwareApplication for the home page. Only facts that are on the site (Impressum, Preise). */
export function homeJsonLd() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": ORG_ID,
        name: "Wendico",
        url: SITE_URL,
        logo: { "@type": "ImageObject", url: `${SITE_URL}/icons/icon-512.png`, width: 512, height: 512 },
        email: CONTACT_EMAIL,
        legalName: "Wendico KLG",
        telephone: "+41795041005",
        taxID: "CHE-298.049.775",
        address: { "@type": "PostalAddress", streetAddress: "Im Hofacker 3", postalCode: "8478", addressLocality: "Gütighausen", addressCountry: "CH" },
        brand: { "@type": "Brand", name: SITE_NAME },
      },
      {
        "@type": "WebSite",
        "@id": WEBSITE_ID,
        name: SITE_NAME,
        url: SITE_URL,
        inLanguage: SITE_LANG,
        publisher: { "@id": ORG_ID },
      },
      softwareApplicationJsonLd(),
    ],
  };
}

export function softwareApplicationJsonLd() {
  return {
    "@type": "SoftwareApplication",
    "@id": APP_ID,
    name: SITE_NAME,
    url: SITE_URL,
    description: "Bewerbungs-Tracker für die Lehrstellensuche: Lehrstellen finden, Bewerbungen und Fristen organisieren und den Fortschritt mit der Lehrperson teilen.",
    applicationCategory: "EducationalApplication",
    applicationSubCategory: "Bewerbungs-Tracker",
    operatingSystem: "Web, iOS, Android (PWA)",
    inLanguage: SITE_LANG,
    image: `${SITE_URL}${OG_IMAGES.default.url}`,
    publisher: { "@id": ORG_ID },
    audience: { "@type": "EducationalAudience", educationalRole: "student", audienceType: "Schülerinnen und Schüler der Sekundarschule" },
    offers: {
      "@type": "Offer",
      price: OFFER.price.toFixed(2),
      priceCurrency: OFFER.priceCurrency,
      description: OFFER.description,
      url: abs(OFFER.url),
      availability: "https://schema.org/InStock",
    },
  };
}

/** One Offer per plan and billing interval, prices read from the catalogue (lib/billing/plans.ts). No VAT wording (not registered). */
function planOffer(name: string, price: number, unit: "MON" | "ANN", description: string) {
  return {
    "@type": "Offer",
    name,
    description,
    price: price.toFixed(2),
    priceCurrency: "CHF",
    url: abs("/preise"),
    availability: "https://schema.org/InStock",
    priceSpecification: { "@type": "UnitPriceSpecification", price: price.toFixed(2), priceCurrency: "CHF", unitCode: unit, unitText: unit === "MON" ? "Monat" : "Jahr" },
  };
}

/** /preise: the app with every public price (Einzelabo, Familienpaket, school packages) as an offer list. */
export function pricingJsonLd() {
  const solo = PLANS.solo, family = PLANS.family;
  const offers = [
    planOffer(`${solo.name} pro Monat`, solo.priceChfPerMonth ?? 0, "MON", "1 Schülerkonto, monatlich kündbar auf Ende der Laufzeit."),
    planOffer(`${solo.name} pro Jahr`, solo.priceChfPerYear ?? 0, "ANN", "1 Schülerkonto, jährliche Zahlung."),
    planOffer(`${family.name} pro Monat`, family.priceChfPerMonth ?? 0, "MON", "1 Schülerkonto und 1 Elternkonto."),
    planOffer(`${family.name} pro Jahr`, family.priceChfPerYear ?? 0, "ANN", "1 Schülerkonto und 1 Elternkonto, jährliche Zahlung."),
    ...PACKAGES.map((p) => planOffer(`Schullizenz ${p.name}`, p.pricePerYear, "ANN", `Für Schulen, bis ${p.maxStudents} Schülerinnen und Schüler, Lehrpersonen inbegriffen.`)),
  ];
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "@id": APP_ID,
    name: SITE_NAME,
    url: SITE_URL,
    applicationCategory: "EducationalApplication",
    operatingSystem: "Web, iOS, Android (PWA)",
    publisher: { "@id": ORG_ID },
    offers,
  };
}

/** BreadcrumbList for a subpage: Start > (parents) > page. */
export function breadcrumbJsonLd(trail: { name: string; path: string }[]) {
  const items = [{ name: "Start", path: "/" }, ...trail];
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: abs(it.path) })),
  };
}

/** Visible text of a FAQ answer (string or simple JSX with links/strong), so the JSON-LD matches what users read. */
export function nodeText(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join("");
  if (typeof node === "object" && "props" in node) return nodeText((node.props as { children?: ReactNode }).children);
  return "";
}

export function faqJsonLd(items: { q: string; a: ReactNode }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: nodeText(f.a).replace(/\s+/g, " ").trim() } })),
  };
}

/** JSON for a <script type="application/ld+json">, escaped against </script> injection. */
export function jsonLdString(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
