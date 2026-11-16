/**
 * THE one place for the public consumer offer (pupils / families) used in SEO metadata and the
 * SoftwareApplication JSON-LD. WendApply is free during the launch phase; paid plans follow later.
 * When pricing goes live, change only this file (price, label, description) and the structured data follows.
 *
 * Rules: never claim permanent free use ("immer kostenlos", "für immer gratis"). School licence prices live in
 * lib/b2b/licence.ts and are not touched here. Swiss spelling only (ss, never the sharp s).
 */
export const OFFER = {
  /** Price in CHF for pupils and families right now. */
  price: 0,
  priceCurrency: "CHF",
  /** Short wording for meta descriptions and badges. */
  label: "kostenlos während der Lancierung",
  /** Longer wording for structured data (Offer.description). */
  description: "Für Schülerinnen und Schüler kostenlos während der Lancierung. Schulen nutzen eine Jahreslizenz, Preise unter wendapply.ch/preise.",
  /** Where the current conditions are explained. */
  url: "/preise",
} as const;
