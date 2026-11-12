// The 26 cantons. Data-free helpers that are safe to ship to the browser (the localities directory is NOT imported here).
import { fold } from "../job-filters/query.ts";

export interface CantonInfo { code: string; name: string; lat: number; lon: number }

export const CANTONS: CantonInfo[] = [
  { code: "AG", name: "Aargau", lat: 47.39, lon: 8.05 }, { code: "AI", name: "Appenzell Innerrhoden", lat: 47.32, lon: 9.41 },
  { code: "AR", name: "Appenzell Ausserrhoden", lat: 47.37, lon: 9.3 }, { code: "BE", name: "Bern", lat: 46.82, lon: 7.63 },
  { code: "BL", name: "Basel-Landschaft", lat: 47.45, lon: 7.77 }, { code: "BS", name: "Basel-Stadt", lat: 47.56, lon: 7.59 },
  { code: "FR", name: "Freiburg", lat: 46.72, lon: 7.07 }, { code: "GE", name: "Genf", lat: 46.22, lon: 6.12 },
  { code: "GL", name: "Glarus", lat: 46.98, lon: 9.07 }, { code: "GR", name: "Graubünden", lat: 46.66, lon: 9.63 },
  { code: "JU", name: "Jura", lat: 47.35, lon: 7.15 }, { code: "LU", name: "Luzern", lat: 47.08, lon: 8.1 },
  { code: "NE", name: "Neuenburg", lat: 46.99, lon: 6.78 }, { code: "NW", name: "Nidwalden", lat: 46.93, lon: 8.39 },
  { code: "OW", name: "Obwalden", lat: 46.85, lon: 8.24 }, { code: "SG", name: "St. Gallen", lat: 47.2, lon: 9.2 },
  { code: "SH", name: "Schaffhausen", lat: 47.7, lon: 8.59 }, { code: "SO", name: "Solothurn", lat: 47.3, lon: 7.63 },
  { code: "SZ", name: "Schwyz", lat: 47.06, lon: 8.76 }, { code: "TG", name: "Thurgau", lat: 47.57, lon: 9.1 },
  { code: "TI", name: "Tessin", lat: 46.3, lon: 8.82 }, { code: "UR", name: "Uri", lat: 46.78, lon: 8.63 },
  { code: "VD", name: "Waadt", lat: 46.57, lon: 6.57 }, { code: "VS", name: "Wallis", lat: 46.2, lon: 7.6 },
  { code: "ZG", name: "Zug", lat: 47.16, lon: 8.52 }, { code: "ZH", name: "Zürich", lat: 47.41, lon: 8.66 },
];
export const CANTON_CODES = CANTONS.map((canton) => canton.code);
export const cantonByCode = (code: string | undefined) => CANTONS.find((canton) => canton.code === code?.toUpperCase());

const CODE_PATTERN = new RegExp(`(?:^|[\\s,(/-])(${CANTON_CODES.join("|")})(?=$|[\\s,)/-])`);
const NAME_ALIASES: Record<string, string> = {
  vaud: "VD", valais: "VS", ticino: "TI", geneve: "GE", geneva: "GE", fribourg: "FR", neuchatel: "NE", grisons: "GR", graubunden: "GR",
  "basel land": "BL", baselland: "BL", baselbiet: "BL", "basel stadt": "BS", "appenzell ausserrhoden": "AR", "appenzell innerrhoden": "AI",
};
const NAMES = new Map<string, string>([...CANTONS.map((canton) => [fold(canton.name), canton.code] as [string, string]), ...Object.entries(NAME_ALIASES)]);

/** Upper-case two-letter canton code written in a text ("Winterthur ZH", "Buchs (SG)", "Foo, VD"). */
export function cantonCodeInText(text: string | undefined): string | undefined {
  return text?.match(CODE_PATTERN)?.[1];
}

/** Canton whose (German/French/Italian) name is the whole text, e.g. "Aargau", "Waadt", "Vaud". */
export function cantonFromName(text: string | undefined): string | undefined {
  return text ? NAMES.get(fold(text)) : undefined;
}

/** Canton named anywhere in a text, by code or by name ("Kanton Waadt", "Region Thurgau", "Foo, VD"). No localities involved. */
export function cantonInText(text: string | undefined): string | undefined {
  if (!text?.trim()) return undefined;
  const code = cantonCodeInText(text);
  if (code) return code;
  const folded = ` ${fold(text)} `;
  for (const [name, canton] of NAMES) if (folded.includes(` ${name} `)) return canton;
  return undefined;
}
