// Swiss geography for the job search. The data lives in lib/geo (official localities directory, ONE source of truth);
// this module keeps the earlier helper names for existing callers. It imports the whole directory: server/tests only.
// Browser code takes cantons from lib/geo/cantons.ts and distances from the search API (`distanceKm` on each result).
import { cantonByCode, cantonInText } from "../geo/cantons.ts";
import { baseName, geocode, placeKey } from "../geo/places.ts";

export { CANTONS, CANTON_CODES, cantonByCode } from "../geo/cantons.ts";
export type { CantonInfo } from "../geo/cantons.ts";
export { distanceKm } from "../geo/places.ts";

/** Canton of a postcode, from the directory. */
export function plzToCanton(plz: number | string): string | undefined {
  const value = String(plz).trim();
  if (!/^[1-9]\d{3}$/.test(value)) return undefined;
  const match = geocode(value);
  return match && cantonByCode(match.canton) ? match.canton : undefined;
}

export interface ResolvedLocation { canton?: string; lat?: number; lon?: number; city?: string; plz?: string }

/** Resolve free text ("8001 Zürich", "Winterthur ZH", "Bern", "Region Basel", "Kanton Waadt") to canton and coordinates. `city` is set when a locality was found. */
export function resolveLocation(text: string | undefined): ResolvedLocation | undefined {
  if (!text?.trim()) return undefined;
  const match = geocode(text);
  if (match) return { canton: cantonByCode(match.canton) ? match.canton : undefined, lat: match.lat, lon: match.lon, city: placeKey(baseName(match.locality.name)), plz: match.locality.plz };
  const canton = cantonInText(text);
  const info = cantonByCode(canton);
  return info ? { canton: info.code, lat: info.lat, lon: info.lon } : undefined;
}
