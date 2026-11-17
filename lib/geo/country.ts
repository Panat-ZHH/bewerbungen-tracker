// Country of a listing (ISO 3166 alpha-2, "CH" = Switzerland). Data-free and safe for the browser: the localities
// directory is NOT imported here; the search API passes in what its geocoder found.
import { CANTON_CODES, cantonCodeInText } from "./cantons.ts";
import { fold } from "../job-filters/query.ts";

export const SWITZERLAND = "CH";

export const COUNTRY_LABELS: Record<string, string> = {
  CH: "Schweiz", LI: "Liechtenstein", DE: "Deutschland", AT: "Österreich", FR: "Frankreich", IT: "Italien",
};
export const countryLabel = (code: string | undefined) => (code ? COUNTRY_LABELS[code] ?? code : "Land unbekannt");

// Words that name a foreign country (or a typical foreign address form) in a place text. Folded (no umlauts, lower case).
const FOREIGN_WORDS: [RegExp, string][] = [
  [/\b(?:deutschland|germany|allemagne|germania|bundesrepublik)\b/, "DE"],
  [/\b(?:osterreich|oesterreich|austria|autriche)\b/, "AT"],
  [/\b(?:liechtenstein|furstentum)\b/, "LI"],
  [/\b(?:frankreich|france|francia)\b/, "FR"],
  [/\b(?:italien|italia|italy|italie)\b/, "IT"],
];
// Swiss-wide wording that names no single place ("Schweizweit", "ganze Schweiz", "Suisse romande").
const SWISS_WORDS = /\b(?:schweiz|schweizweit|switzerland|suisse|svizzera|svizra|deutschschweiz|romandie|ostschweiz|westschweiz|zentralschweiz|nordwestschweiz)\b/;

// French / Italian names of Swiss towns that jobup.ch and others use and the (German) localities directory does not know.
const SWISS_EXONYMS = /\b(?:winterthour|bale|berne|lucerne|soleure|coire|schaffhouse|saint gall|st gall|san gallo|bienne|morat|thoune|berthoud|zoug|zugo|glaris|frauenfeld|aarau|argovie|thurgovie|grisons|lucerna|basilea|berna|zurigo|ginevra|losanna|friburgo|neuchatel|soletta|sciaffusa|coira|bellinzone|lugano|locarno|sion|sierre|martigny|monthey|brigue|viege|loeche|olten|baden|zofingue|bulle|yverdon|nyon|vevey|montreux)\b/;

/** Country named in a free text place, by country name or a foreign address prefix ("D-78462 Konstanz", "FL-9490 Vaduz", "A-6800 Feldkirch"). */
export function countryInText(text: string | undefined): string | undefined {
  if (!text?.trim()) return undefined;
  const prefix = text.match(/(?:^|[\s,(])(D|DE|A|AT|F|FR|I|IT|FL|LI|CH)-\s?\d{4,5}\b/i)?.[1]?.toUpperCase();
  if (prefix) return ({ D: "DE", A: "AT", F: "FR", I: "IT", FL: "LI" } as Record<string, string>)[prefix] ?? prefix;
  const folded = fold(text);
  for (const [pattern, code] of FOREIGN_WORDS) if (pattern.test(folded)) return code;
  if (SWISS_WORDS.test(folded) || SWISS_EXONYMS.test(folded)) return SWITZERLAND;
  return undefined;
}

export interface CountryEvidence {
  /** Structured country code from the source (jobs.ch / jobup.ch carry one per location). */
  structured?: string;
  /** Canton of the locality the geocoder matched ("FL" = Liechtenstein); undefined when nothing matched. */
  matchedCanton?: string;
  /** The source only lists Swiss places (Yousty: apprenticeships in Switzerland), so a listing without a usable place is Swiss. */
  swissSource?: boolean;
}

/**
 * Country of a listing. Order: the source's structured code, the matched locality, a country written in the place text,
 * a Swiss canton on the listing, a Swiss-only source. Unknown (e.g. "Homeoffice", a German town) stays undefined.
 */
export function detectListingCountry(job: { location?: string; canton?: string; country?: string }, evidence: CountryEvidence = {}): string | undefined {
  const structured = evidence.structured?.trim().toUpperCase();
  if (structured && /^[A-Z]{2}$/.test(structured)) return structured;
  if (evidence.matchedCanton) return evidence.matchedCanton === "FL" ? "LI" : SWITZERLAND;
  const named = countryInText(job.location);
  if (named) return named;
  if (job.country && /^[A-Z]{2}$/.test(job.country)) return job.country;
  if (job.canton && CANTON_CODES.includes(job.canton.toUpperCase())) return SWITZERLAND;
  if (cantonCodeInText(job.location)) return SWITZERLAND;
  return evidence.swissSource ? SWITZERLAND : undefined;
}

/** Country of a listing in the browser: what the search API set, else a Swiss canton means Switzerland. */
export function listingCountry(job: { location?: string; canton?: string; country?: string }): string | undefined {
  return job.country ?? detectListingCountry(job);
}

export const isSwiss = (job: { location?: string; canton?: string; country?: string }) => listingCountry(job) === SWITZERLAND;
