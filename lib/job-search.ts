import { load } from "cheerio";
import robotsParser from "robots-parser";
import { listingSources, mergeJobResults, type JobSearchResult } from "./job-results.ts";
import { CANTON_CODES, cantonFromName } from "./geo/cantons.ts";
import { cantonsWithin, distanceKm, geocode, locateListing, placeNamesWithin, samePlace, withinRadius, type PlaceMatch } from "./geo/places.ts";
import { DEFAULT_RADIUS_KM, RADIUS_OPTIONS } from "./job-filters/taxonomy.ts";
import { splitPlace } from "./job-query-parse.ts";

export type { JobSearchResult } from "./job-results.ts";

export type SearchKind = "job" | "apprenticeship";

/** Optional filters forwarded to the sources where they are supported (verified: jobs.ch `publication-date`, `employment-type=1` = Temporär). */
export interface ServerJobFilters {
  postedWithin?: 1 | 3 | 7 | 14 | 30;
  jobTypes?: string[];
  /** 0 = "Nur dieser Ort", else km. Only used with a place; default 10. */
  radiusKm?: number;
  cantons?: string[];
}

export interface SourceCursor { page: number; offset: number; /** index into the source's request plan (cantons / groups of place names) */ segment?: number }

/** The place a search ran for, resolved from the Ort field or from the free text ("Informatiker Zürich"). */
export interface SearchPlace { label: string; name: string; plz: string; canton: string; lat: number; lon: number; radiusKm: number; fromQuery: boolean }

export class PlaceNotFoundError extends Error {
  readonly code = "unknown_place";
}

export interface JobSearchInput {
  query: string;
  location: string;
  kind: SearchKind;
  filters?: ServerJobFilters;
  cursor?: SourceCursor;
  excludedUrls?: string[];
}

export interface JobSearchBatch {
  results: JobSearchResult[];
  nextCursor: SourceCursor | null;
  warning?: string;
  /** listings left out because their place could not be recognised (only when a place is searched) */
  hidden?: number;
}

export type JobSource = "yousty" | "jobs" | "jobup";
export type SourceCursors = Record<JobSource, SourceCursor | null>;
export type SourceStatus = { name: string; status: "ok" | "partial" | "unavailable" | "exhausted"; count: number; message?: string };

export interface MultiSourceSearchInput extends Omit<JobSearchInput, "cursor"> {
  cursor?: SourceCursors;
  knownResults?: JobSearchResult[];
  /** results per request, 10..60 (default 25) */
  pageSize?: number;
}

export interface MultiSourceSearchBatch {
  results: JobSearchResult[];
  updates: JobSearchResult[];
  nextCursor: SourceCursors | null;
  sources: SourceStatus[];
  warning?: string;
  /** Profession part of the search text (a place typed into it is split off). */
  query: string;
  /** Place text the search ran for ("" = whole Switzerland). */
  location: string;
  place: SearchPlace | null;
  /** Canton named in the search text ("Informatiker Aargau"); the client turns it into its canton filter. */
  cantons?: string[];
  /** Listings hidden in this batch because their place could not be recognised. */
  hiddenWithoutPlace: number;
}

const sourceNames: Record<JobSource, string> = { yousty: "Yousty", jobs: "jobs.ch", jobup: "jobup.ch" };

const userAgent = "WendApply/1.0";
const robotsCache = new Map<string, { expires: number; rules: ReturnType<typeof robotsParser> }>();

function requestSignal(timeout: number, signal?: AbortSignal) {
  return signal ? AbortSignal.any([signal, AbortSignal.timeout(timeout)]) : AbortSignal.timeout(timeout);
}

async function checkRobots(url: URL, signal?: AbortSignal) {
  const robotsUrl = new URL("/robots.txt", url);
  const cached = robotsCache.get(url.origin);
  if (cached && cached.expires > Date.now()) {
    if (cached.rules.isAllowed(url.href, userAgent) === false) throw new Error("Diese Quelle erlaubt den automatischen Abruf dieser Suche nicht.");
    return;
  }
  const robotsResponse = await fetch(robotsUrl, {
    headers: { "User-Agent": userAgent },
    signal: requestSignal(8000, signal),
    cache: "no-store",
    redirect: "error",
  });
  if (!robotsResponse.ok) throw new Error("Die Regeln der Quelle konnten nicht geprüft werden.");
  const robots = robotsParser(robotsUrl.href, await robotsResponse.text());
  robotsCache.set(url.origin, { rules: robots, expires: Date.now() + 3600000 });
  if (robots.isAllowed(url.href, userAgent) === false) throw new Error("Diese Quelle erlaubt den automatischen Abruf dieser Suche nicht.");
}

const transientStatuses = new Set([429, 500, 502, 503, 504]);

const RETRY_DELAYS = [300, 900];

/** Up to two retries with a short backoff for network errors, timeouts (10 s per attempt) and transient 5xx/429 answers; robots and redirects are handled by the caller. */
async function fetchWithRetry(url: URL, signal?: AbortSignal): Promise<Response> {
  const attempt = () => fetch(url, { headers: { "User-Agent": userAgent, Accept: "text/html" }, signal: requestSignal(10000, signal), cache: "no-store", redirect: "manual" });
  for (const delay of RETRY_DELAYS) {
    try {
      const response = await attempt();
      if (!transientStatuses.has(response.status)) return response;
      await response.body?.cancel();
    } catch (cause) {
      if (signal?.aborted) throw cause;
    }
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  return attempt();
}

async function getPublicHtml(url: URL, signal?: AbortSignal): Promise<string> {
  let current = url;
  let response: Response | undefined;
  for (let redirects = 0; redirects <= 3; redirects++) {
    await checkRobots(current, signal);
    response = await fetchWithRetry(current, signal);
    if (![301, 302, 303, 307, 308].includes(response.status)) break;
    const location = response.headers.get("location");
    await response.body?.cancel();
    if (!location || redirects === 3) throw new Error("Die Quelle leitet die Suche zu oft weiter.");
    const next = new URL(location, current);
    if (next.origin !== url.origin) throw new Error("Die Quelle leitet die Suche auf eine andere Domain weiter.");
    current = next;
  }
  if (!response) throw new Error("Die Quelle antwortet gerade nicht.");
  if (!response.ok) throw new Error("Die Quelle ist gerade nicht erreichbar oder blockiert den Abruf.");
  if (!response.headers.get("content-type")?.includes("text/html")) throw new Error("Die Quelle liefert keine lesbare Suchseite.");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Die Suchseite ist leer.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 4000000) {
      await reader.cancel();
      throw new Error("Die Suchseite ist zu gross.");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

const cantonCodes = new Set(CANTON_CODES);

function compact<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined && entry !== "")) as T;
}

export function cantonFromText(text: string | undefined): string | undefined {
  const code = text?.match(/(?:^|[\s,(/-])([A-Z]{2})\)?\s*$/)?.[1];
  return code && cantonCodes.has(code) ? code : undefined;
}

export function parseWorkload(text: string | undefined): { workloadMin?: number; workloadMax?: number } {
  const numbers = [...(text ?? "").matchAll(/(\d{1,3})\s*%?/g)].map((match) => Number(match[1])).filter((value) => value >= 1 && value <= 100);
  if (!numbers.length || !/%/.test(text ?? "")) return {};
  return { workloadMin: Math.min(...numbers), workloadMax: Math.max(...numbers) };
}

function isoDay(date: Date) {
  return date.toISOString().slice(0, 10);
}

/** "Heute", "Gestern", "Vor 2 Tagen", "Letzte Woche", "Il y a 3 jours" ... -> ISO date (day precision), undefined when not a date. */
export function parsePostedAt(text: string | undefined, now = new Date()): string | undefined {
  const value = text?.trim().toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
  if (!value) return undefined;
  const ago = (days: number) => isoDay(new Date(now.getTime() - days * 86400000));
  if (/^(heute|aujourd'?hui|neu|nouveau|vor .*(minute|stunde)|il y a .*(minute|heure))/.test(value)) return ago(0);
  if (/^(gestern|hier)$/.test(value)) return ago(1);
  if (/^(letzte woche|la semaine derniere|vor einer woche|il y a une semaine)$/.test(value)) return ago(7);
  if (/^(letzten monat|letzter monat|vor einem monat|le mois dernier|il y a un mois)$/.test(value)) return ago(30);
  const match = value.match(/^(?:vor|il y a)\s+(\d+)\s+(tag|woche|monat|jour|semaine|mois)/);
  if (match) return ago(Number(match[1]) * (/^(tag|jour)/.test(match[2]) ? 1 : /^(woche|semaine)/.test(match[2]) ? 7 : 30));
  const dated = value.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (dated) return `${dated[3]}-${dated[2].padStart(2, "0")}-${dated[1].padStart(2, "0")}`;
  return undefined;
}

function jobTypeFromContract(contract: string | undefined, workload: { workloadMin?: number; workloadMax?: number }): JobSearchResult["jobType"] {
  const value = (contract ?? "").toLowerCase();
  if (/schnupper/.test(value)) return "schnupperlehre";
  if (/lehrstelle|lehre|apprentissage/.test(value)) return "lehrstelle";
  if (/praktikum|stage|volontariat|internship/.test(value)) return "praktikum";
  if (/tempor|befrist|cdd|interim/.test(value)) return "temporaer";
  if (/freelance|freie|mandat|indep/.test(value)) return "freelance";
  if (/festanstellung|unbefristet|cdi|employ/.test(value)) {
    if (workload.workloadMax === undefined) return undefined;
    return workload.workloadMax < 100 ? "teilzeit" : "vollzeit";
  }
  return value ? "other" : undefined;
}

export function parseSalary(text: string | undefined): { salaryMin?: number; salaryMax?: number } {
  const numbers = [...(text ?? "").matchAll(/\d{1,3}(?:['’.,]\d{3})+|\d{5,6}/g)].map((match) => Number(match[0].replace(/\D/g, ""))).filter((value) => value >= 20000 && value <= 1000000);
  return numbers.length ? { salaryMin: Math.min(...numbers), salaryMax: Math.max(...numbers) } : {};
}

function titleMeta(title: string, now: Date): Pick<JobSearchResult, "education" | "startDate" | "remote"> {
  const year = title.match(/\b(20[2-3]\d)\b/)?.[1];
  const currentYear = now.getFullYear();
  return {
    education: /\bEFZ\b/.test(title) ? "efz" : /\bEBA\b/.test(title) ? "eba" : undefined,
    startDate: year && Number(year) >= currentYear ? year : undefined,
    remote: /home\s?-?office|remote|télétravail|telearbeit/i.test(title) ? "hybrid" : undefined,
  };
}

/** jobs.ch / jobup.ch embed their search state as JSON; every listing has structured locations (canton, city, postcode). Best effort, never throws. */
export function jobsStateLocations(html: string): Map<string, { canton?: string; city?: string; plz?: string }> {
  const found = new Map<string, { canton?: string; city?: string; plz?: string }>();
  const text = (value: string | undefined) => {
    if (value === undefined) return undefined;
    try { return JSON.parse(`"${value}"`) as string; } catch { return undefined; }
  };
  for (const match of html.matchAll(/"id":"([0-9a-f]{8}-[0-9a-f-]{27})"(?:(?!"id":")[^]){0,2500}?"locations":\[(\{[^\]]*?\})?\]/g)) {
    if (found.has(match[1]) || !match[2]) continue;
    const field = (name: string) => text(match[2].match(new RegExp(`"${name}":"((?:[^"\\\\]|\\\\.)*)"`))?.[1]);
    const canton = field("cantonCode");
    found.set(match[1], { canton: canton && cantonCodes.has(canton) ? canton : undefined, city: field("city") || undefined, plz: field("postalCode") || undefined });
  }
  return found;
}

const apprenticeshipTitle = /\b(?:lehrstellen?|berufslehre|lernende[rn]?|apprenti(?:e|ssage)?)\b/i;

export function parseJobsHtml(html: string, source: "jobs" | "jobup" = "jobs", onlyApprenticeships = false, now = new Date()): JobSearchResult[] {
  const document = load(html);
  const results = new Map<string, JobSearchResult>();
  const origin = source === "jobs" ? "https://www.jobs.ch" : "https://www.jobup.ch";
  const detailPattern = source === "jobs" ? /^\/de\/stellenangebote\/detail\/[a-z0-9-]+\/$/ : /^\/fr\/emplois\/detail\/[a-z0-9-]+\/$/;
  const state = jobsStateLocations(html);
  document('a[data-cy="job-link"]').each((_index, element) => {
    const link = document(element);
    const href = link.attr("href");
    const title = link.attr("title")?.trim();
    if (!href || !title) return;
    const url = new URL(href, origin);
    if (url.origin !== origin || !detailPattern.test(url.pathname)) return;
    const card = link.closest('[data-cy="serp-item"]');
    const labelled = (labels: string[]) => card.find("span").filter((_index, span) => labels.includes(document(span).text().trim())).first().siblings("p").text().trim();
    const structured = state.get(url.pathname.split("/").filter(Boolean).pop() ?? "");
    // the card label is what people see; the structured city only fills a missing label
    const place = labelled(["Arbeitsort:", "Lieu de travail:"]) || structured?.city || "";
    const contract = labelled(["Vertragsart:", "Type de contrat:"]);
    const workload = parseWorkload(labelled(["Pensum:", "Taux d'activité:", "Taux d’activité:"]));
    const salary = parseSalary(labelled(["Lohn:", "Salaire:"]));
    const postedAt = parsePostedAt(card.find('[data-cy^="serp-item-"] p').first().text(), now);
    // many apprenticeships are published as "Festanstellung" or without a contract type: the title decides as well
    const apprenticeship = /^(Lehrstelle|Lehre|Apprentissage)$/i.test(contract) || apprenticeshipTitle.test(title);
    if (onlyApprenticeships && !apprenticeship) return;
    const company = card.find("p.fw_bold").last().text().trim();
    results.set(url.href, compact({
      title, company: company || undefined, location: place || undefined, url: url.href, source: sourceNames[source],
      contract: contract || undefined, jobType: apprenticeship && !/^(Lehrstelle|Lehre|Apprentissage)$/i.test(contract) ? "lehrstelle" as const : jobTypeFromContract(contract, workload), ...workload, ...salary, postedAt,
      canton: structured?.canton ?? cantonFromText(place), ...titleMeta(title, now),
    }));
  });
  return [...results.values()];
}

export async function searchJobs(input: JobSearchInput): Promise<JobSearchResult[]> {
  return (await searchJobBatch(input)).results;
}

export function hasNextPage(html: string, url: URL, page: number): boolean {
  const document = load(html);
  return document('a[rel~="next"], link[rel~="next"]').toArray().some((element) => {
    const href = document(element).attr("href");
    if (!href) return false;
    try {
      const next = new URL(href, url);
      return next.origin === url.origin && next.pathname === url.pathname && Number(next.searchParams.get("page")) === page + 1;
    } catch {
      return false;
    }
  });
}

/** A search with its place resolved. Built once per request by `resolveSearch` and shared by all sources. */
export interface ResolvedSearch {
  query: string;
  location: string;
  kind: SearchKind;
  filters?: ServerJobFilters;
  origin?: PlaceMatch;
  radiusKm: number;
  fromQuery: boolean;
  /** cantons to search when there is no place (canton filter or a canton named in the text) */
  cantons: string[];
  /** canton named in the search text */
  textCanton?: string;
}

/** Radius actually used: missing -> 10 km, legacy values above 50 (old "100 km" links) -> 50 km, anything else unknown -> 10 km. */
export function normalizeRadius(value: number | undefined): number {
  if (value === undefined) return DEFAULT_RADIUS_KM;
  if ((RADIUS_OPTIONS as readonly number[]).includes(value)) return value;
  return value > 50 ? 50 : DEFAULT_RADIUS_KM;
}

/**
 * Turns the raw input into profession + place. The place comes from the Ort field or, when that is empty, from the end of the
 * search text ("Informatiker Zürich") – both go through the same resolver (lib/geo/places.ts `geocode`).
 */
export function resolveSearch(input: Pick<JobSearchInput, "query" | "location" | "kind" | "filters">): ResolvedSearch {
  let query = input.query.trim();
  let location = input.location.trim();
  let fromQuery = false;
  let textCanton: string | undefined;
  const cantons = (input.filters?.cantons ?? []).filter((code) => cantonCodes.has(code));
  const split = splitPlace(query);
  // a canton typed into the Ort field ("Aargau") is a canton search, not a place
  const fieldCanton = location && !geocode(location, { fuzzy: true }) ? cantonFromName(location.replace(/^kanton\s+/i, "")) : undefined;
  if (fieldCanton) { textCanton = fieldCanton; location = ""; }
  else if (!location) {
    if (split.location) { query = split.query; location = split.location; fromQuery = true; }
    else if (split.canton) { query = split.query; textCanton = split.canton; }
  }
  const base = { kind: input.kind, filters: input.filters, radiusKm: normalizeRadius(input.filters?.radiusKm), fromQuery, textCanton };
  if (!location) return { ...base, query, location: "", cantons: textCanton ? [textCanton] : cantons };
  const origin = geocode(location, { fuzzy: true });
  if (!origin) throw new PlaceNotFoundError(`Den Ort „${location}“ kennen wir leider nicht. Wähle einen Vorschlag aus der Liste oder gib eine Postleitzahl ein.`);
  // "Polymechaniker Winterthur" with Ort = Winterthur: the place is not part of the profession
  if (!fromQuery && split.location) {
    const typed = geocode(split.location);
    if (typed && samePlace(typed.locality, origin.locality)) query = split.query;
  }
  return { ...base, query, location, origin, cantons: [] };
}

function searchPlace(search: ResolvedSearch): SearchPlace | null {
  if (!search.origin) return null;
  const { locality, label } = search.origin;
  return { label, name: locality.name, plz: locality.plz, canton: locality.canton, lat: locality.lat, lon: locality.lon, radiusKm: search.radiusKm, fromQuery: search.fromQuery };
}

interface Segment { url: URL; canton?: string }
const NAMES_PER_REQUEST = 60;
const MAX_NAME_REQUESTS = 12;

/**
 * The requests a source needs for this search, in order (the cursor's `segment` is an index into this list).
 * The sources cannot filter by distance in a way we may use (Yousty's place pages only show 10 listings of a 14 km circle and their
 * further pages need parameters that robots.txt forbids; jobs.ch/jobup.ch match the exact place name only). So we ask for a wider
 * area and filter ourselves: Yousty by canton (all cantons that reach into the radius), jobs.ch/jobup.ch by the names of all
 * localities inside the radius (several `location` parameters per request).
 */
async function sourceSegments(search: ResolvedSearch, source: JobSource, signal?: AbortSignal): Promise<Segment[]> {
  if (source === "yousty") {
    const slug = await professionSlug(search.query, signal);
    const cantons = search.origin ? cantonsWithin(search.origin.locality, search.radiusKm) : search.cantons;
    const page = (canton?: string): Segment => ({ url: new URL(`/de-CH/lehrstellen/${canton ? `${canton}/` : ""}${slug}`, "https://www.yousty.ch"), canton });
    return cantons.length ? cantons.map((canton) => page(canton)) : [page()];
  }
  const base = () => {
    const url = new URL(source === "jobs" ? "https://www.jobs.ch/de/stellenangebote/" : "https://www.jobup.ch/fr/emplois/");
    url.searchParams.set("term", search.kind === "apprenticeship" ? `${search.query} Lehrstelle` : search.query);
    if (search.filters?.postedWithin) url.searchParams.set("publication-date", String(search.filters.postedWithin));
    if (search.filters?.jobTypes?.length === 1 && search.filters.jobTypes[0] === "temporaer") url.searchParams.set("employment-type", "1");
    return url;
  };
  if (!search.origin) return [{ url: base() }];
  const names = placeNamesWithin(search.origin.locality, search.radiusKm, NAMES_PER_REQUEST * MAX_NAME_REQUESTS);
  const segments: Segment[] = [];
  for (let start = 0; start < names.length; start += NAMES_PER_REQUEST) {
    const url = base();
    for (const name of names.slice(start, start + NAMES_PER_REQUEST)) url.searchParams.append("location", name);
    segments.push({ url });
  }
  return segments;
}

/** Normalises the listing's place, computes the distance to the searched place (the one spot where this happens) and decides whether it is inside the radius. */
function placeEntry(entry: JobSearchResult, search: ResolvedSearch, source: JobSource, segment: Segment): { job: JobSearchResult; keep: boolean; unresolved: boolean } {
  const hint = entry.canton ?? segment.canton;
  const { job, match } = locateListing(entry, source === "yousty" ? { preferCanton: hint } : { canton: hint });
  if (!search.origin) return { job, keep: true, unresolved: false };
  if (!match) return { job, keep: false, unresolved: true };
  const inPlace = samePlace(search.origin.locality, match.locality);
  const located: JobSearchResult = { ...job, distanceKm: Math.round(distanceKm(search.origin.locality, match.locality) * 10) / 10, ...(inPlace ? { inPlace: true } : {}) };
  return { job: located, keep: withinRadius(search.origin.locality, match.locality, search.radiusKm), unresolved: false };
}

function looksLikeSource(html: string, source: JobSource): boolean {
  const title = load(html)("title").text();
  return source === "yousty" ? /lehrstelle|yousty/i.test(title) : source === "jobs" ? /jobs\.ch/i.test(title) : /jobup\.ch/i.test(title);
}

const MORE_FAILED = "Weitere Anzeigen konnten gerade nicht geladen werden. Deine bisherigen Treffer bleiben da – mit «Mehr laden» versuchst du es nochmals.";

export async function searchJobBatch(input: JobSearchInput): Promise<JobSearchBatch> {
  return searchSourceBatch(input, input.kind === "apprenticeship" ? "yousty" : "jobs");
}

const publicCursor = (cursor: Required<SourceCursor>): SourceCursor => (cursor.segment ? cursor : { page: cursor.page, offset: cursor.offset });

async function searchSourceBatch(input: JobSearchInput, source: JobSource, limit = 25, signal = AbortSignal.timeout(45000), search?: ResolvedSearch, deadline = Date.now() + 30000): Promise<JobSearchBatch> {
  if (!input.query.trim()) throw new Error("Bitte gib einen Beruf ein.");
  const resolved = search ?? resolveSearch(input);
  let cursor: Required<SourceCursor> = { page: input.cursor?.page ?? 1, offset: input.cursor?.offset ?? 0, segment: input.cursor?.segment ?? 0 };
  if (!Number.isInteger(cursor.page) || cursor.page < 1 || cursor.page > 1000 || !Number.isInteger(cursor.offset) || cursor.offset < 0 || cursor.offset > 1000 || !Number.isInteger(cursor.segment) || cursor.segment < 0 || cursor.segment > 60) {
    throw new Error("Ungültige Ergebnisseite. Starte die Suche erneut.");
  }
  const segments = await sourceSegments(resolved, source, signal);
  const results = new Map<string, JobSearchResult>();
  const excluded = new Set(input.excludedUrls ?? []);
  let hidden = 0;
  const batch = (nextCursor: Required<SourceCursor> | null, warning?: string): JobSearchBatch => ({
    results: [...results.values()], nextCursor: nextCursor && publicCursor(nextCursor), ...(warning ? { warning } : {}), ...(hidden ? { hidden } : {}),
  });
  // with a place most fetched listings are filtered out again, so more pages may be read per call
  const maxPages = resolved.origin ? 8 : 5;
  for (let pagesRead = 0; pagesRead < maxPages; pagesRead++) {
    if (cursor.segment >= segments.length) return batch(null);
    if (pagesRead > 0 && Date.now() > deadline) break;
    const segment = segments[cursor.segment];
    const pageUrl = new URL(segment.url);
    if (cursor.page > 1) pageUrl.searchParams.set("page", String(cursor.page));
    let html: string;
    try {
      html = await getPublicHtml(pageUrl, signal);
    } catch (cause) {
      if (!results.size) throw cause;
      return batch(cursor, MORE_FAILED);
    }
    const entries = source === "yousty" ? parseYoustyHtml(html, youstyCanton(segment.url)) : parseJobsHtml(html, source);
    const allowed = source !== "yousty" && input.kind === "apprenticeship" ? new Set(parseJobsHtml(html, source, true).map((result) => result.url)) : null;
    // A page of the source without listings is the end of that list (also when the source links to an empty further page).
    // Only HTML that is not a result page of the source at all (block page, changed markup) is a failure.
    if (!entries.length && !looksLikeSource(html, source)) {
      if (!results.size) throw new Error("Die Treffer dieser Quelle lassen sich gerade nicht lesen. Bitte versuche es später wieder.");
      return batch(cursor, MORE_FAILED);
    }
    const hasMore = entries.length > 0 && hasNextPage(html, pageUrl, cursor.page);
    const following = (): Required<SourceCursor> | null => hasMore
      ? { segment: cursor.segment, page: cursor.page + 1, offset: 0 }
      : cursor.segment + 1 < segments.length ? { segment: cursor.segment + 1, page: 1, offset: 0 } : null;
    for (let index = cursor.offset; index < entries.length; index++) {
      const entry = entries[index];
      if (allowed && !allowed.has(entry.url)) continue;
      if (excluded.has(entry.url) || results.has(entry.url)) continue;
      const placed = placeEntry(entry, resolved, source, segment);
      if (placed.unresolved) { hidden++; continue; }
      if (!placed.keep) continue;
      results.set(entry.url, placed.job);
      if (results.size === limit) return batch(index + 1 < entries.length ? { ...cursor, offset: index + 1 } : following());
    }
    const next = following();
    if (!next) return batch(null);
    cursor = next;
  }
  return batch(cursor);
}

/** Yousty list URLs look like /de-CH/lehrstellen/ZH/<slug> (canton page) or /de-CH/lehrstellen/ZH/Zuerich/<slug>; the path carries the canton. */
export function youstyCanton(url: URL): string | undefined {
  const code = url.pathname.match(/^\/de-CH\/lehrstellen\/([A-Z]{2})\//)?.[1];
  return code && cantonCodes.has(code) ? code : undefined;
}

/** Friendly text for a source that failed; technical details stay in the server log. */
function sourceProblem(reason: unknown): string {
  const message = reason instanceof Error ? reason.message : "";
  if (/Lehrberuf|erlaubt|Ergebnisseite|lesen/.test(message)) return message;
  return "antwortet gerade nicht. Versuch es in ein paar Minuten nochmals.";
}

export async function searchMultipleSources(input: MultiSourceSearchInput): Promise<MultiSourceSearchBatch> {
  if (!input.query.trim()) throw new Error("Bitte gib einen Beruf ein.");
  const search = resolveSearch(input);
  const enabled: JobSource[] = input.kind === "apprenticeship" ? ["yousty", "jobs"] : ["jobs", "jobup"];
  const cursors: SourceCursors = input.cursor ? { ...input.cursor } : { yousty: null, jobs: null, jobup: null };
  if (!input.cursor) for (const source of enabled) cursors[source] = { page: 1, offset: 0 };
  const known = mergeJobResults([], input.knownResults ?? []);
  let merged = known;
  const failed = new Set<JobSource>();
  const statuses = new Map<JobSource, SourceStatus>();
  for (const source of enabled) statuses.set(source, { name: sourceNames[source], status: cursors[source] ? "ok" : "exhausted", count: 0 });
  const warnings: string[] = [];
  const signal = AbortSignal.timeout(45000);
  // stop starting new rounds after 25 s: what is loaded is returned, the cursor lets "Mehr laden" continue
  const deadline = Date.now() + 25000;
  let succeeded = false;
  let hidden = 0;
  const pageSize = Number.isInteger(input.pageSize) ? Math.min(60, Math.max(10, input.pageSize!)) : 25;
  for (let round = 0; round < 4; round++) {
    const remaining = pageSize - (merged.length - known.length);
    const active = enabled.filter((source) => cursors[source] && !failed.has(source)).slice(0, remaining);
    if (remaining <= 0 || !active.length || (round > 0 && Date.now() > deadline)) break;
    const excludedUrls = [...new Set([...(input.excludedUrls ?? []), ...merged.flatMap((result) => listingSources(result).map((source) => source.url))])];
    const batches = await Promise.allSettled(active.map((source, index) => searchSourceBatch(
      { query: input.query, location: input.location, kind: input.kind, filters: input.filters, cursor: cursors[source]!, excludedUrls },
      source,
      Math.floor(remaining / active.length) + (index < remaining % active.length ? 1 : 0),
      signal,
      search,
      deadline,
    )));
    for (const [index, batch] of batches.entries()) {
      const source = active[index];
      const previous = statuses.get(source)!;
      if (batch.status === "rejected") {
        // results of earlier rounds stay; the cursor is kept so the next "Mehr laden" retries this source
        failed.add(source);
        const message = previous.count ? MORE_FAILED : sourceProblem(batch.reason);
        statuses.set(source, { name: sourceNames[source], status: previous.count ? "partial" : "unavailable", count: previous.count, message });
        warnings.push(`${sourceNames[source]}: ${message}`);
        continue;
      }
      succeeded = true;
      merged = mergeJobResults(merged, batch.value.results);
      cursors[source] = batch.value.nextCursor;
      hidden += batch.value.hidden ?? 0;
      const count = previous.count + batch.value.results.length;
      statuses.set(source, { name: sourceNames[source], status: batch.value.warning ? "partial" : cursors[source] ? "ok" : "exhausted", count, message: batch.value.warning });
      if (batch.value.warning) {
        warnings.push(`${sourceNames[source]}: ${batch.value.warning}`);
        failed.add(source);
      }
    }
  }
  if (!succeeded && enabled.some((source) => cursors[source])) throw new Error(warnings.join(" ") || "Keine Quelle konnte geladen werden.");
  return {
    results: merged.slice(known.length),
    updates: merged.slice(0, known.length).filter((result, index) => listingSources(result).length > listingSources(known[index]).length),
    nextCursor: enabled.some((source) => cursors[source]) ? cursors : null,
    sources: [...statuses.values()],
    warning: warnings.length ? warnings.join(" ") : undefined,
    query: search.query,
    location: search.location,
    place: searchPlace(search),
    ...(search.textCanton ? { cantons: [search.textCanton] } : {}),
    hiddenWithoutPlace: hidden,
  };
}

function normalize(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/[^a-z0-9]+/g, " ").trim();
}

const professionAliases: Record<string, string> = {
  informatik: "informatiker", ict: "informatiker", it: "informatiker", kv: "kaufmann", kauffrau: "kaufmann", kaufleute: "kaufmann", "kaufmann kauffrau": "kaufmann",
  fage: "fachmann gesundheit", "fachfrau gesundheit": "fachmann gesundheit", detailhandel: "detailhandelsfachmann", koch: "koch", koechin: "koch", schreinerin: "schreiner",
  polymechanikerin: "polymechaniker", elektronikerin: "elektroniker", mediamatikerin: "mediamatiker", informatikerin: "informatiker",
};

/** Local fallback for the shared query expansion: strips filler words (Lehrstelle, EFZ, m/w/d ...) and maps common aliases. First entry is always the original. */
export function queryVariants(query: string): string[] {
  const original = query.trim();
  const stripped = normalize(original.replace(/\((?:[mwfd]\/?)+\)/gi, " ").replace(/[/:]in\b/gi, ""))
    .split(" ").filter((word) => word && !["lehrstelle", "lehrstellen", "lehre", "ausbildung", "als", "zum", "zur", "efz", "eba", "stift", "praktikum", "stage", "m", "w", "d", "f"].includes(word)).join(" ");
  const variants = [original];
  if (stripped) variants.push(stripped);
  for (const candidate of [stripped, normalize(original)]) if (professionAliases[candidate]) variants.push(professionAliases[candidate]);
  return [...new Set(variants)];
}

export function findProfessionSlug(html: string, query: string): string | undefined {
  const document = load(html);
  const terms = normalize(query).split(" ");
  const candidates = new Set<string>();
  document('a[href*="/lehrstellen/berufe/"]').each((_index, element) => {
    const slug = document(element).attr("href")?.split("/").pop();
    if (!slug || !/^\d+-[a-z0-9-]+$/.test(slug)) return;
    const name = normalize(slug.replace(/^\d+-/, ""));
    if (terms.every((term) => name.split(" ").some((word) => word.startsWith(term)))) candidates.add(slug);
  });
  return [...candidates].sort((first, second) => first.length - second.length)[0];
}

export function parseYoustyHtml(html: string, defaultCanton?: string, now = new Date()): JobSearchResult[] {
  const document = load(html);
  const results = new Map<string, JobSearchResult>();
  document('.title_and_location a[href*="/lehrstellen/profile/"]').each((_index, element) => {
    const link = document(element);
    const href = link.attr("href");
    const title = link.find("h2.title").text().trim();
    if (!href || !title) return;
    const url = new URL(href, "https://www.yousty.ch");
    if (url.origin !== "https://www.yousty.ch" || !/^\/de-CH\/lehrstellen\/profile\/\d+-[a-z0-9-]+$/.test(url.pathname)) return;
    // "Bei <strong>Firma</strong> in <strong>Ort</strong>": the word in front decides what a value is, not its position
    // (a listing with only "in <strong>Ort</strong>" must not turn the place into the company).
    const info = link.find(".company-info");
    let company = "";
    let location = "";
    let label = "";
    info.contents().each((_position, node) => {
      if (node.type === "text") { label = node.data; return; }
      if (node.type !== "tag" || node.name !== "strong") return;
      const value = document(node).text().trim();
      if (/\bin\s*$/i.test(label)) location ||= value;
      else if (/\bbei\s*$/i.test(label) || !company) company ||= value;
      else location ||= value;
      label = "";
    });
    if (!company && !location) {
      const details = info.find("strong");
      company = details.eq(0).text().trim();
      location = details.eq(1).text().trim();
    }
    results.set(url.href, compact({
      title, company: company || undefined, location: location || undefined, url: url.href, source: "Yousty",
      contract: "Lehrstelle", jobType: "lehrstelle" as const, canton: cantonFromText(location) ?? defaultCanton, ...titleMeta(title, now),
    }));
  });
  return [...results.values()];
}

let catalogCache: { expires: number; html: string } | undefined;

/** Yousty's profession page for a search text. The catalogue of professions changes rarely and is kept for an hour. */
async function professionSlug(query: string, signal?: AbortSignal): Promise<string> {
  if (!catalogCache || catalogCache.expires <= Date.now()) {
    catalogCache = { html: await getPublicHtml(new URL("https://www.yousty.ch/de-CH/lehrstellen/berufe"), signal), expires: Date.now() + 3600000 };
  }
  const catalog = catalogCache.html;
  const slug = queryVariants(query).map((variant) => findProfessionSlug(catalog, variant)).find(Boolean);
  if (!slug) throw new Error("Dieser Lehrberuf wurde nicht gefunden. Nutze einen genauen Beruf, zum Beispiel Informatiker oder Kaufmann.");
  return slug;
}

const searchCache = new Map<string, { expires: number; value: MultiSourceSearchBatch }>();

export function clearSearchCache() {
  searchCache.clear();
  catalogCache = undefined;
}

/** Identical searches (same query, filters, cursor, known results) within 60 s are answered from memory so paging back and forth does not hit the sources again. */
export async function searchMultipleSourcesCached(input: MultiSourceSearchInput, ttl = 60000, now = Date.now()): Promise<MultiSourceSearchBatch> {
  const key = JSON.stringify([input.query.toLowerCase(), input.location.toLowerCase(), input.kind, input.filters ?? null, input.cursor ?? null, input.pageSize ?? null, [...(input.excludedUrls ?? [])].sort(), (input.knownResults ?? []).map((result) => result.url)]);
  for (const [cacheKey, entry] of searchCache) if (entry.expires <= now) searchCache.delete(cacheKey);
  const hit = searchCache.get(key);
  if (hit) return structuredClone(hit.value);
  const value = await searchMultipleSources(input);
  if (!value.warning) {
    if (searchCache.size >= 100) searchCache.delete(searchCache.keys().next().value!);
    searchCache.set(key, { expires: now + ttl, value: structuredClone(value) });
  }
  return value;
}
