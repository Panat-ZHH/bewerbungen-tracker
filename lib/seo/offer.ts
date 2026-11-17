/**
 * THE one place for the public consumer offer (pupils / families) used in SEO metadata and the
 * SoftwareApplication JSON-LD. Access model (docs/access/SPEC.md): 7-day free trial, then Einzelabo CHF 4.90 / month
 * (CHF 49 / year) or Familienpaket CHF 7.90 / month; students of a licensed school use it through the school.
 *
 * Rules: never claim permanent free use ("immer kostenlos", "für immer gratis"). School licence prices live in
 * lib/b2b/licence.ts and are not touched here. Swiss spelling only (ss, never the sharp s).
 */
export const OFFER = {
  /** Lowest price in CHF for a pupil without school licence (Einzelabo, monthly). */
  price: 4.9,
  priceCurrency: "CHF",
  /** Short wording for meta descriptions and badges. */
  label: "7 Tage kostenlos testen, danach ab CHF 4.90 pro Monat",
  /** Longer wording for structured data (Offer.description). */
  description: "7 Tage kostenlos testen. Danach Einzelabo für CHF 4.90 pro Monat oder CHF 49 pro Jahr, Familienpaket für CHF 7.90 pro Monat. Mit Schullizenz bezahlt die Schule. Preise unter wendapply.ch/preise.",
  /** Where the current conditions are explained. */
  url: "/preise",
} as const;
