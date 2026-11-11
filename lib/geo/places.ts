// The ONE place resolver of WendApply: place text -> locality of the official Swiss directory -> coordinates -> distance.
// Used by the search API (place of the search, places of the listings), the free-text parser ("Informatiker Zürich"),
// the autocomplete route and the legacy helpers in lib/job-filters/geo.ts. Server/test side only: it imports the whole
// directory (about 190 KB), so browser code must not import this module (see docs/job-search.md).
import { LOCALITIES_RAW, MUNICIPALITIES_RAW } from "./localities-data.ts";
import { editDistance, fold } from "../job-filters/query.ts";
import { CANTON_CODES, cantonCodeInText, cantonFromName } from "./cantons.ts";

export interface Locality { name: string; plz: string; canton: string; lat: number; lon: number; /** municipality number (BFS) */ bfs: number }
export interface PlaceMatch {
  locality: Locality;
  /** Text for the UI, e.g. "Winterthur", "Buchs AG", "8450 Andelfingen". */
  label: string;
  canton: string;
  lat: number;
  lon: number;
  /** plz = matched by postcode, name = exact name, partial = leading words only ("Zürich Oerlikon"), fuzzy = one typo. */
  precision: "plz" | "name" | "partial" | "fuzzy";
}
export interface GeocodeOptions {
  /** Canton known from the source: only localities of this canton match (ignored when none of the candidates is in it). */
  canton?: string;
  /** Soft hint for ambiguous names, e.g. the canton page a listing was found on. */
  preferCanton?: string;
  /** Allow one typo (user input only, never for listings). */
  fuzzy?: boolean;
  /** Allow "Zürich Oerlikon" -> Zürich (default true). */
  partial?: boolean;
}

/** Folded comparison key of a place name: "St. Gallen" = "Sankt Gallen" = "st gallen", "Zürich" = "Zuerich" = "zurich". */
export function placeKey(value: string): string {
  return fold(value).replace(/\b(?:sankt|saint)\b/g, "st").replace(/\bsainte\b/g, "ste");
}

const CANTON_SUFFIX = new RegExp(`\\s+\\(?(?:${CANTON_CODES.join("|")}|FL)\\)?$`);
/** Official names carry additions ("Buchs AG", "Glattpark (Opfikon)", "Lausanne 25", "Egg b. Zürich"): the plain name people write. */
export function baseName(name: string): string {
  return name.replace(/\s*\([^)]*\)\s*$/, "").replace(/\s+\d+$/, "").replace(CANTON_SUFFIX, "").replace(/\s+(?:b\.|bei|a\.|am|an der|a\.d\.|im|i\.|ob)\s.*$/i, "").trim();
}

// Names people use that differ from the official (local-language) name: alias -> official name (both compared by placeKey).
const ALIASES: Record<string, string> = {
  genf: "geneve", geneva: "geneve", ginevra: "geneve", neuenburg: "neuchatel", freiburg: "fribourg", sitten: "sion", siders: "sierre",
  delsberg: "delemont", pruntrut: "porrentruy", bellenz: "bellinzona", lucerne: "luzern", lucerna: "luzern", berne: "bern", berna: "bern",
  bale: "basel", basilea: "basel", zurigo: "zurich", "st gall": "st gallen", "san gallo": "st gallen", losanna: "lausanne", coira: "chur", coire: "chur",
  soleure: "solothurn", schaffhouse: "schaffhausen", martinach: "martigny", yverdon: "yverdon les bains", neuenstadt: "la neuveville", morat: "murten", bendern: "Gamprin-Bendern", gamprin: "Gamprin-Bendern",
};

// "The largest / most likely place wins" for names that exist in several cantons and are written without a canton.
// The directory has no population figures, so the well-known cases are listed; everything else falls back to the municipality with more localities.
const PREFERRED: Record<string, string> = {
  buchs: "SG", wil: "SG", gossau: "SG", rapperswil: "SG", pfaffikon: "ZH", wetzikon: "ZH", ruti: "ZH", wald: "ZH", kilchberg: "ZH", aesch: "BL", reinach: "BL",
  oberwil: "BL", altdorf: "UR", stein: "AG", au: "SG", berg: "TG", egg: "ZH", teufen: "AR", zell: "LU", kirchberg: "SG", lengnau: "BE", laupen: "BE",
  munchwilen: "TG", baar: "ZG", villeneuve: "VD", romont: "FR", ecublens: "VD", colombier: "NE", schwanden: "GL", eschenbach: "SG", burglen: "UR",
  zuzwil: "SG", roggwil: "BE", seedorf: "BE", weiningen: "ZH", benken: "SG", niederglatt: "ZH", malans: "GR", marbach: "SG", rickenbach: "ZH",
};

interface Directory {
  all: Locality[];
  byPlz: Map<string, Locality[]>;
  /** key of the full official name (and aliases) */
  exact: Map<string, Locality[]>;
  /** key of the plain name, of each part of "Biel/Bienne", and of municipality names that are no locality themselves */
  base: Map<string, Locality[]>;
  /** rough size: number of directory entries of the municipality */
  weight: Map<number, number>;
  keys: string[];
}

let directory: Directory | undefined;

function push(map: Map<string, Locality[]>, key: string, locality: Locality) {
  if (!key) return;
  const list = map.get(key);
  if (!list) map.set(key, [locality]);
  else if (!list.includes(locality)) list.push(locality);
}

function load(): Directory {
  if (directory) return directory;
  const all: Locality[] = LOCALITIES_RAW.split("\n").map((line) => {
    const [name, plz, canton, lat, lon, bfs] = line.split(";");
    return { name, plz, canton, lat: Number(lat), lon: Number(lon), bfs: Number(bfs) };
  });
  const byPlz = new Map<string, Locality[]>();
  const exact = new Map<string, Locality[]>();
  const base = new Map<string, Locality[]>();
  const weight = new Map<number, number>();
  const byBfs = new Map<number, Locality[]>();
  for (const locality of all) {
    push(byPlz, locality.plz, locality);
    push(exact, placeKey(locality.name), locality);
    const plain = baseName(locality.name);
    push(base, placeKey(plain), locality);
    if (plain.includes("/")) for (const part of plain.split("/")) push(base, placeKey(part), locality);
    weight.set(locality.bfs, (weight.get(locality.bfs) ?? 0) + 1);
    byBfs.set(locality.bfs, [...(byBfs.get(locality.bfs) ?? []), locality]);
  }
  // municipalities whose name is not a locality name ("Illnau-Effretikon", "Rapperswil-Jona") point to their main locality
  for (const line of MUNICIPALITIES_RAW.split("\n")) {
    const [bfs, name] = line.split(";");
    const members = byBfs.get(Number(bfs));
    if (!members?.length) continue;
    for (const key of new Set([placeKey(name), placeKey(baseName(name))])) {
      if (!key || exact.has(key) || base.has(key)) continue;
      const words = key.split(" ");
      const main = members.find((member) => words.includes(placeKey(baseName(member.name)))) ?? [...members].sort((a, b) => a.plz.localeCompare(b.plz))[0];
      base.set(key, [main]);
    }
  }
  for (const [alias, target] of Object.entries(ALIASES)) {
    const list = exact.get(placeKey(target)) ?? base.get(placeKey(target));
    if (list && !exact.has(placeKey(alias))) exact.set(placeKey(alias), list);
  }
  directory = { all, byPlz, exact, base, weight, keys: [...new Set([...exact.keys(), ...base.keys()])] };
  return directory;
}

/** All localities of the directory (do not mutate). */
export function allLocalities(): Locality[] {
  return load().all;
}

export function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

const sizeOf = (dir: Directory, locality: Locality, sameName: number) => sameName * 3 + (dir.weight.get(locality.bfs) ?? 0);

/** Chooses one locality among candidates with the same written name. Rule: canton given in the text > soft canton hint > preferred list > larger place > lower PLZ. */
function pick(dir: Directory, candidates: Locality[], key: string, options: GeocodeOptions): Locality {
  let pool = candidates;
  const inCanton = (code: string | undefined) => (code ? pool.filter((locality) => locality.canton === code.toUpperCase()) : []);
  const hard = inCanton(options.canton);
  if (hard.length) pool = hard;
  else {
    const soft = inCanton(options.preferCanton);
    const preferred = inCanton(PREFERRED[key]);
    if (soft.length) pool = soft;
    else if (preferred.length) pool = preferred;
  }
  const count = (locality: Locality) => pool.filter((other) => other.bfs === locality.bfs).length;
  return [...pool].sort((a, b) => sizeOf(dir, b, count(b)) - sizeOf(dir, a, count(a)) || a.plz.localeCompare(b.plz))[0];
}

const FILLER = /^(?:region|raum|grossraum|agglomeration|agglo|stadt|kanton|gemeinde|nahe|bei|in|um|umgebung|standort|arbeitsort)\s+/;
const stripFillers = (key: string) => { let value = key; while (FILLER.test(value)) value = value.replace(FILLER, ""); return value; };

function lookup(dir: Directory, text: string, partial: boolean): { candidates: Locality[]; key: string; precision: "name" | "partial" } | undefined {
  const key = stripFillers(placeKey(text.replace(CANTON_SUFFIX, "")));
  if (!key) return undefined;
  const direct = dir.exact.get(key) ?? dir.base.get(key);
  if (direct) return { candidates: direct, key, precision: "name" };
  if (!partial) return undefined;
  const words = key.split(" ");
  for (let size = words.length - 1; size >= 1; size--) {
    const head = words.slice(0, size).join(" ");
    if (head.length < 3) break;
    const found = dir.exact.get(head) ?? dir.base.get(head);
    if (found) return { candidates: found, key: head, precision: "partial" };
  }
  return undefined;
}

const toMatch = (locality: Locality, precision: PlaceMatch["precision"], label = locality.name): PlaceMatch => ({ locality, label, canton: locality.canton, lat: locality.lat, lon: locality.lon, precision });

/**
 * Normalises a place text and resolves it to a locality. Understands "8610 Uster", "CH-8400 Winterthur", "Winterthur ZH", "Buchs (SG)",
 * "Rothenburg / Luzern", "Glattpark (Zürich)", "Region Basel", "Zürich Oerlikon", "St. Gallen" / "Sankt Gallen", "Genf", municipality names.
 * A postcode wins over the name; a canton in the text decides between places with the same name.
 */
export function geocode(text: string | undefined, options: GeocodeOptions = {}): PlaceMatch | undefined {
  const raw = text?.replace(/\s+/g, " ").trim();
  if (!raw) return undefined;
  const dir = load();
  let rest = raw.replace(/\bCH[-\s]?(?=\d{4}\b)/i, "");
  const plz = rest.match(/(?:^|\D)([1-9]\d{3})(?!\d)/)?.[1];
  if (plz) rest = rest.replace(plz, " ");
  rest = rest.replace(/\b(?:Schweiz|Switzerland|Suisse|Svizzera)\b/gi, " ").replace(/\s+/g, " ").replace(/^[\s,;/|-]+|[\s,;/|-]+$/g, "");

  const atPlz = plz ? dir.byPlz.get(plz) : undefined;
  if (atPlz) {
    const key = stripFillers(placeKey(rest.replace(CANTON_SUFFIX, "")));
    const named = key ? atPlz.filter((locality) => placeKey(locality.name) === key || placeKey(baseName(locality.name)) === key) : [];
    const main = named[0] ?? [...atPlz].sort((a, b) => Number(a.name.includes("(")) - Number(b.name.includes("(")) || a.name.localeCompare(b.name, "de"))[0];
    return toMatch(main, "plz", rest ? main.name : `${plz} ${main.name}`);
  }

  const hints: string[] = [];
  const withoutParens = rest.replace(/\(([^)]*)\)/g, (_all, inner: string) => { hints.push(inner); return " "; }).replace(/\s+/g, " ").trim();
  const parts = withoutParens.split(/\s*(?:\/|,|;|\||\s[-–]\s|\s+und\s+|&|\+)\s*/).map((part) => part.trim()).filter(Boolean);
  // canton: written as a code, or named in a secondary part ("Glattpark (Zürich)", "Rothenburg / Luzern")
  let canton = options.canton ?? cantonCodeInText(rest);
  if (!canton) {
    for (const hint of [...hints, ...parts.slice(1)]) {
      const named = cantonFromName(hint) ?? lookup(dir, hint, false)?.candidates.map((locality) => locality.canton).find((code, _index, list) => list.every((other) => other === code));
      if (named) { canton = named; break; }
    }
  }
  const choose = (found: { candidates: Locality[]; key: string; precision: "name" | "partial" }) => toMatch(pick(dir, found.candidates, found.key, { ...options, canton }), found.precision);

  // the whole text first: official names contain brackets and slashes ("Glattpark (Opfikon)", "Biel/Bienne")
  const attempts = [...new Set([rest, withoutParens, ...parts])].filter(Boolean);
  for (const attempt of attempts) {
    const found = lookup(dir, attempt, false);
    if (found) return choose(found);
  }
  if (options.partial !== false) {
    for (const attempt of parts) {
      const found = lookup(dir, attempt, true);
      if (found) return choose(found);
    }
  }
  if (plz) {
    // unknown postcode (PO box numbers such as 8000, 3000): the nearest known postcode of the same region
    const wanted = Number(plz);
    for (let offset = 1; offset <= 30; offset++) {
      for (const candidate of [wanted + offset, wanted - offset]) {
        const near = dir.byPlz.get(String(candidate));
        if (near && String(candidate).slice(0, 2) === plz.slice(0, 2)) return toMatch(near[0], "plz", `${plz} ${near[0].name}`);
      }
    }
  }
  if (options.fuzzy) {
    const key = stripFillers(placeKey(parts[0] ?? ""));
    const limit = key.length >= 9 ? 2 : key.length >= 5 ? 1 : 0;
    if (limit) {
      let best: { key: string; distance: number; size: number } | undefined;
      for (const candidate of dir.keys) {
        if (Math.abs(candidate.length - key.length) > limit || candidate[0] !== key[0]) continue;
        const distance = editDistance(key, candidate, limit);
        if (distance > limit) continue;
        const list = dir.exact.get(candidate) ?? dir.base.get(candidate)!;
        const size = Math.max(...list.map((locality) => sizeOf(dir, locality, list.length)));
        if (!best || distance < best.distance || (distance === best.distance && size > best.size)) best = { key: candidate, distance, size };
      }
      if (best) return toMatch(pick(dir, (dir.exact.get(best.key) ?? dir.base.get(best.key))!, best.key, { ...options, canton }), "fuzzy");
    }
  }
  return undefined;
}

/** "Nur dieser Ort": the same municipality (Uster includes Nänikon, Winterthur all its postcodes) or the same name in the same canton. */
export function samePlace(a: Locality, b: Locality): boolean {
  return a.bfs === b.bfs || (a.canton === b.canton && placeKey(baseName(a.name)) === placeKey(baseName(b.name)));
}

/** The one distance rule of the search. radiusKm 0 = "Nur dieser Ort". */
export function withinRadius(origin: Locality, place: Locality, radiusKm: number): boolean {
  if (samePlace(origin, place)) return true;
  return radiusKm > 0 && distanceKm(origin, place) <= radiusKm;
}

/** Localities inside the radius, nearest first. */
export function localitiesWithin(origin: Locality, radiusKm: number): { locality: Locality; km: number }[] {
  return load().all
    .map((locality) => ({ locality, km: distanceKm(origin, locality) }))
    .filter(({ locality, km }) => (samePlace(origin, locality) ? true : radiusKm > 0 && km <= radiusKm))
    .sort((a, b) => a.km - b.km);
}

/** Plain place names inside the radius (nearest first, no duplicates) – what a job board understands as "location". */
export function placeNamesWithin(origin: Locality, radiusKm: number, max = 240): string[] {
  const names = new Map<string, string>();
  names.set(placeKey(baseName(origin.name)), baseName(origin.name));
  for (const { locality } of localitiesWithin(origin, radiusKm)) {
    const plain = baseName(locality.name);
    const key = placeKey(plain);
    if (!names.has(key)) names.set(key, plain);
    if (names.size >= max) break;
  }
  return [...names.values()];
}

/** Cantons with at least one locality inside the radius, nearest first (Liechtenstein excluded). */
export function cantonsWithin(origin: Locality, radiusKm: number): string[] {
  const seen = new Set<string>([origin.canton]);
  for (const { locality } of localitiesWithin(origin, radiusKm)) seen.add(locality.canton);
  return [...seen].filter((code) => CANTON_CODES.includes(code));
}

export interface PlaceSuggestion { name: string; plz: string; canton: string; /** "Winterthur · 8400 · ZH" */ label: string; /** text to put into the field; resolves back to this place */ value: string }

let mains: { locality: Locality; key: string; plain: string; size: number }[] | undefined;
function mainEntries(dir: Directory) {
  if (mains) return mains;
  const groups = new Map<string, Locality[]>();
  for (const locality of dir.all) groups.set(`${locality.name}|${locality.canton}`, [...(groups.get(`${locality.name}|${locality.canton}`) ?? []), locality]);
  mains = [...groups.values()].map((list) => {
    const locality = [...list].sort((a, b) => a.plz.localeCompare(b.plz))[0];
    return { locality, key: placeKey(locality.name), plain: placeKey(baseName(locality.name)), size: sizeOf(dir, locality, list.length) };
  });
  return mains;
}

function suggestion(locality: Locality, withPlz: boolean): PlaceSuggestion {
  const resolved = withPlz ? undefined : geocode(locality.name, { partial: false });
  const value = resolved && samePlace(resolved.locality, locality) ? locality.name : `${locality.plz} ${locality.name}`;
  return { name: locality.name, plz: locality.plz, canton: locality.canton, label: `${locality.name} · ${locality.plz} · ${locality.canton}`, value };
}

/** Autocomplete: place name (prefix, any word, umlaut/accents tolerant) or postcode prefix. One row per place for names, one per postcode for digits. */
export function suggestPlaces(query: string, limit = 8): PlaceSuggestion[] {
  const text = query.trim().slice(0, 60);
  if (text.length < 2) return [];
  const dir = load();
  const digits = text.match(/^(\d{1,4})\b\s*(.*)$/);
  if (digits) {
    const rest = placeKey(digits[2]);
    return dir.all
      .filter((locality) => locality.plz.startsWith(digits[1]) && (!rest || placeKey(locality.name).startsWith(rest)))
      .sort((a, b) => a.plz.localeCompare(b.plz) || Number(a.name.includes("(")) - Number(b.name.includes("(")) || a.name.localeCompare(b.name, "de"))
      .slice(0, limit).map((locality) => suggestion(locality, true));
  }
  const key = placeKey(text);
  if (!key) return [];
  const aliasTarget = Object.entries(ALIASES).find(([name]) => placeKey(name) === key)?.[1];
  const alias = aliasTarget ? placeKey(aliasTarget) : undefined;
  const rank = (entry: { key: string; plain: string }) => {
    if (entry.key === key || entry.key === alias) return 0;
    if (entry.plain === key) return 1;
    if (entry.key.startsWith(key) || (alias && entry.key.startsWith(alias))) return 2;
    if (entry.key.split(" ").some((word) => word.startsWith(key))) return 3;
    return -1;
  };
  return mainEntries(dir)
    .map((entry) => ({ entry, score: rank(entry) }))
    .filter(({ score }) => score >= 0)
    .sort((a, b) => a.score - b.score || b.entry.size - a.entry.size || a.entry.locality.name.localeCompare(b.entry.locality.name, "de"))
    .slice(0, limit).map(({ entry }) => suggestion(entry.locality, false));
}

const LEGAL_FORM = /^(.*(?:\b(?:AG|GmbH|SA|S\.A\.|Sàrl|Sarl|Sagl|KlG|KLG|Ltd\.?|Inc\.?|Genossenschaft|Stiftung|Holding)|& Co\.?|& Cie\.?))[\s,–-]+(\p{L}[\p{L}\d .'’/-]{1,40})$/u;
const TRAILING_PLACE = /^(.{3,}?)\s*(?:[,|–]|\s-)\s+(\p{L}[\p{L}\d .'’/-]{1,40})$|^(.{3,}?)\s*\((\p{L}[\p{L}\d .'’/-]{1,40})\)$/u;

/**
 * Some listings have no place but carry it in the company name ("Loomis Schweiz AG Kloten", "Muster GmbH, Uster", "Beispiel AG (Zug)").
 * Splits only when the tail is exactly a known locality, so "Bank Linth" or "Zürcher Kantonalbank" stay untouched.
 */
export function splitCompanyPlace(company: string | undefined): { company: string; place: string } | undefined {
  const text = company?.replace(/\s+/g, " ").trim();
  if (!text) return undefined;
  const legal = text.match(LEGAL_FORM);
  const trailing = legal ? undefined : text.match(TRAILING_PLACE);
  const head = legal?.[1] ?? trailing?.[1] ?? trailing?.[3];
  const tail = legal?.[2] ?? trailing?.[2] ?? trailing?.[4];
  if (!head || !tail || tail.split(" ").length > 4) return undefined;
  if (!geocode(tail, { partial: false })) return undefined;
  return { company: head.replace(/[\s,–-]+$/, ""), place: tail.trim() };
}

export interface ListingPlace { company?: string; location?: string; canton?: string }

/**
 * Central normalisation of a listing's place before anything filters on it: trims the place text, recovers a place that slipped
 * into the company name, resolves the locality and sets the canton from the directory.
 */
export function locateListing<T extends ListingPlace>(job: T, options: GeocodeOptions = {}): { job: T; match?: PlaceMatch } {
  let next = job;
  const location = job.location?.replace(/\s+/g, " ").trim();
  if (location !== job.location) next = { ...next, location: location || undefined };
  if (!location) {
    const split = splitCompanyPlace(job.company);
    if (split) next = { ...next, company: split.company, location: split.place };
  }
  const match = geocode(next.location, options);
  const canton = match && CANTON_CODES.includes(match.canton) ? match.canton : match ? undefined : next.canton ?? cantonCodeInText(next.location);
  if (canton !== next.canton) next = { ...next, canton };
  if (next.canton === undefined && "canton" in next) { next = { ...next }; delete next.canton; }
  if (next.location === undefined && "location" in next) { next = { ...next }; delete next.location; }
  return { job: next, match };
}
