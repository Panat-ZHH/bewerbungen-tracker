// Approximate Swiss geography: cantons (centroids), main cities, PLZ ranges. Good enough for radius/canton filtering, not for navigation.
import { fold } from "./query.ts";

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

interface City { names: string[]; canton: string; lat: number; lon: number }
const CITIES: City[] = [
  { names: ["zurich", "zuerich"], canton: "ZH", lat: 47.377, lon: 8.54 }, { names: ["winterthur"], canton: "ZH", lat: 47.5, lon: 8.724 },
  { names: ["uster"], canton: "ZH", lat: 47.35, lon: 8.72 }, { names: ["dietikon"], canton: "ZH", lat: 47.4, lon: 8.4 },
  { names: ["bulach"], canton: "ZH", lat: 47.52, lon: 8.54 }, { names: ["wetzikon"], canton: "ZH", lat: 47.32, lon: 8.8 },
  { names: ["thalwil"], canton: "ZH", lat: 47.29, lon: 8.56 }, { names: ["horgen"], canton: "ZH", lat: 47.26, lon: 8.6 },
  { names: ["kloten"], canton: "ZH", lat: 47.45, lon: 8.58 }, { names: ["opfikon"], canton: "ZH", lat: 47.43, lon: 8.57 },
  { names: ["bern", "berne"], canton: "BE", lat: 46.948, lon: 7.447 }, { names: ["biel", "bienne"], canton: "BE", lat: 47.14, lon: 7.25 },
  { names: ["thun"], canton: "BE", lat: 46.76, lon: 7.63 }, { names: ["burgdorf"], canton: "BE", lat: 47.06, lon: 7.63 },
  { names: ["langenthal"], canton: "BE", lat: 47.21, lon: 7.79 }, { names: ["interlaken"], canton: "BE", lat: 46.69, lon: 7.86 },
  { names: ["basel", "bale"], canton: "BS", lat: 47.559, lon: 7.588 }, { names: ["liestal"], canton: "BL", lat: 47.48, lon: 7.73 },
  { names: ["pratteln"], canton: "BL", lat: 47.52, lon: 7.69 }, { names: ["allschwil"], canton: "BL", lat: 47.55, lon: 7.54 },
  { names: ["luzern", "lucerne"], canton: "LU", lat: 47.05, lon: 8.31 }, { names: ["emmen"], canton: "LU", lat: 47.08, lon: 8.3 },
  { names: ["sursee"], canton: "LU", lat: 47.17, lon: 8.11 }, { names: ["zug"], canton: "ZG", lat: 47.17, lon: 8.517 },
  { names: ["baar"], canton: "ZG", lat: 47.2, lon: 8.53 }, { names: ["cham"], canton: "ZG", lat: 47.18, lon: 8.46 },
  { names: ["aarau"], canton: "AG", lat: 47.39, lon: 8.044 }, { names: ["baden"], canton: "AG", lat: 47.47, lon: 8.31 },
  { names: ["wettingen"], canton: "AG", lat: 47.47, lon: 8.32 }, { names: ["lenzburg"], canton: "AG", lat: 47.39, lon: 8.18 },
  { names: ["brugg"], canton: "AG", lat: 47.48, lon: 8.2 }, { names: ["zofingen"], canton: "AG", lat: 47.29, lon: 7.95 },
  { names: ["rheinfelden"], canton: "AG", lat: 47.55, lon: 7.8 }, { names: ["st gallen", "sankt gallen", "saint gall"], canton: "SG", lat: 47.424, lon: 9.377 },
  { names: ["rapperswil", "rapperswil jona"], canton: "SG", lat: 47.23, lon: 8.82 }, { names: ["wil"], canton: "SG", lat: 47.46, lon: 9.05 },
  { names: ["gossau"], canton: "SG", lat: 47.42, lon: 9.25 }, { names: ["buchs"], canton: "SG", lat: 47.17, lon: 9.48 },
  { names: ["chur"], canton: "GR", lat: 46.85, lon: 9.53 }, { names: ["davos"], canton: "GR", lat: 46.8, lon: 9.84 },
  { names: ["schaffhausen"], canton: "SH", lat: 47.697, lon: 8.634 }, { names: ["frauenfeld"], canton: "TG", lat: 47.557, lon: 8.9 },
  { names: ["kreuzlingen"], canton: "TG", lat: 47.65, lon: 9.17 }, { names: ["arbon"], canton: "TG", lat: 47.51, lon: 9.43 },
  { names: ["solothurn"], canton: "SO", lat: 47.208, lon: 7.537 }, { names: ["olten"], canton: "SO", lat: 47.35, lon: 7.9 },
  { names: ["grenchen"], canton: "SO", lat: 47.19, lon: 7.4 }, { names: ["fribourg", "freiburg"], canton: "FR", lat: 46.803, lon: 7.151 },
  { names: ["bulle"], canton: "FR", lat: 46.62, lon: 7.06 }, { names: ["neuchatel", "neuenburg"], canton: "NE", lat: 46.99, lon: 6.93 },
  { names: ["la chaux de fonds"], canton: "NE", lat: 47.1, lon: 6.83 }, { names: ["geneve", "genf", "geneva"], canton: "GE", lat: 46.204, lon: 6.143 },
  { names: ["lausanne"], canton: "VD", lat: 46.52, lon: 6.633 }, { names: ["yverdon", "yverdon les bains"], canton: "VD", lat: 46.78, lon: 6.64 },
  { names: ["montreux"], canton: "VD", lat: 46.43, lon: 6.91 }, { names: ["vevey"], canton: "VD", lat: 46.46, lon: 6.84 },
  { names: ["nyon"], canton: "VD", lat: 46.38, lon: 6.24 }, { names: ["sion", "sitten"], canton: "VS", lat: 46.23, lon: 7.36 },
  { names: ["visp"], canton: "VS", lat: 46.29, lon: 7.88 }, { names: ["martigny"], canton: "VS", lat: 46.1, lon: 7.07 },
  { names: ["brig", "brig glis"], canton: "VS", lat: 46.32, lon: 7.99 }, { names: ["lugano"], canton: "TI", lat: 46.005, lon: 8.952 },
  { names: ["bellinzona", "bellenz"], canton: "TI", lat: 46.19, lon: 9.02 }, { names: ["locarno"], canton: "TI", lat: 46.17, lon: 8.8 },
  { names: ["delemont", "delsberg"], canton: "JU", lat: 47.365, lon: 7.34 }, { names: ["porrentruy"], canton: "JU", lat: 47.42, lon: 7.08 },
  { names: ["glarus"], canton: "GL", lat: 47.04, lon: 9.07 }, { names: ["altdorf"], canton: "UR", lat: 46.88, lon: 8.64 },
  { names: ["schwyz"], canton: "SZ", lat: 47.02, lon: 8.65 }, { names: ["pfaffikon", "pfaeffikon"], canton: "SZ", lat: 47.2, lon: 8.78 },
  { names: ["einsiedeln"], canton: "SZ", lat: 47.13, lon: 8.75 }, { names: ["sarnen"], canton: "OW", lat: 46.9, lon: 8.25 },
  { names: ["stans"], canton: "NW", lat: 46.96, lon: 8.37 }, { names: ["herisau"], canton: "AR", lat: 47.39, lon: 9.28 },
  { names: ["appenzell"], canton: "AI", lat: 47.33, lon: 9.41 },
];

/** [fromPlz, toPlz, canton] – coarse ranges; first match wins, specific ranges first. */
const PLZ_RANGES: [number, number, string][] = [
  [1200, 1259, "GE"], [1280, 1299, "VD"], [1000, 1199, "VD"], [1260, 1279, "VD"], [1300, 1499, "VD"], [1500, 1599, "FR"], [1600, 1799, "FR"],
  [1800, 1899, "VD"], [1900, 1999, "VS"], [2000, 2299, "NE"], [2300, 2399, "NE"], [2400, 2499, "BE"], [2500, 2799, "BE"], [2800, 2999, "JU"],
  [3000, 3299, "BE"], [3300, 3399, "BE"], [3400, 3899, "BE"], [3900, 3999, "VS"], [4000, 4059, "BS"], [4100, 4199, "BL"], [4200, 4299, "SO"],
  [4300, 4399, "AG"], [4400, 4499, "BL"], [4500, 4799, "SO"], [4800, 4899, "AG"], [4900, 4999, "BE"], [5000, 5999, "AG"],
  [6000, 6099, "LU"], [6100, 6299, "LU"], [6300, 6349, "ZG"], [6350, 6399, "ZG"], [6400, 6459, "SZ"], [6460, 6499, "UR"], [6500, 6999, "TI"],
  [7000, 7999, "GR"], [8000, 8199, "ZH"], [8200, 8259, "SH"], [8260, 8299, "SH"], [8300, 8399, "ZH"], [8400, 8499, "ZH"], [8500, 8599, "TG"],
  [8600, 8799, "ZH"], [8800, 8899, "ZH"], [8900, 8999, "ZH"], [9000, 9099, "SG"], [9100, 9199, "AR"], [9200, 9299, "SG"], [9300, 9999, "SG"],
];

export function plzToCanton(plz: number | string): string | undefined {
  const value = typeof plz === "number" ? plz : Number(plz);
  if (!Number.isInteger(value)) return undefined;
  return PLZ_RANGES.find(([from, to]) => value >= from && value <= to)?.[2];
}

export interface ResolvedLocation { canton?: string; lat?: number; lon?: number; city?: string }

/** Resolve free text ("8001 Zürich", "Winterthur ZH", "Bern", "Region Basel") to canton and (approximate) coordinates. */
export function resolveLocation(text: string | undefined): ResolvedLocation | undefined {
  if (!text?.trim()) return undefined;
  const folded = ` ${fold(text)} `;
  let canton: string | undefined;
  const plz = text.match(/\b([1-9]\d{3})\b/);
  if (plz) canton = plzToCanton(plz[1]);
  const city = CITIES.map((c) => ({ c, name: c.names.find((n) => folded.includes(` ${n} `)) })).filter((x) => x.name).sort((a, b) => b.name!.length - a.name!.length)[0];
  if (city) return { canton: city.c.canton, lat: city.c.lat, lon: city.c.lon, city: city.name };
  const code = text.match(/(?:^|[\s,(/-])(AG|AI|AR|BE|BL|BS|FR|GE|GL|GR|JU|LU|NE|NW|OW|SG|SH|SO|SZ|TG|TI|UR|VD|VS|ZG|ZH)(?=$|[\s,)/-])/);
  canton = canton ?? code?.[1];
  if (!canton) {
    const named = CANTONS.find((c) => folded.includes(` ${fold(c.name)} `));
    canton = named?.code;
  }
  if (!canton) return undefined;
  const info = cantonByCode(canton)!;
  return { canton, lat: info.lat, lon: info.lon };
}

export function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}
