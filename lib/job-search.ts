import { load } from "cheerio";
import robotsParser from "robots-parser";
import { listingSources, mergeJobResults, type JobSearchResult } from "./job-results.ts";

export type { JobSearchResult } from "./job-results.ts";

export type SearchKind = "job" | "apprenticeship";

/** Optional filters forwarded to the sources where they are supported (verified: jobs.ch `publication-date`, `employment-type=1` = Temporär). */
export interface ServerJobFilters {
  postedWithin?: 1 | 3 | 7 | 14 | 30;
  jobTypes?: string[];
  radiusKm?: number;
  cantons?: string[];
}

export interface JobSearchInput {
  query: string;
  location: string;
  kind: SearchKind;
  filters?: ServerJobFilters;
  cursor?: { page: number; offset: number };
  excludedUrls?: string[];
}

export interface JobSearchBatch {
  results: JobSearchResult[];
  nextCursor: { page: number; offset: number } | null;
  warning?: string;
}

export type JobSource = "yousty" | "jobs" | "jobup";
export type SourceCursors = Record<JobSource, { page: number; offset: number } | null>;

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
  sources: { name: string; status: "ok" | "unavailable" | "exhausted"; count: number; message?: string }[];
  warning?: string;
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

/** One retry for network errors and transient 5xx/429 answers; robots and redirects are handled by the caller. */
async function fetchWithRetry(url: URL, signal?: AbortSignal): Promise<Response> {
  const attempt = () => fetch(url, { headers: { "User-Agent": userAgent, Accept: "text/html" }, signal: requestSignal(12000, signal), cache: "no-store", redirect: "manual" });
  let response: Response | undefined;
  try {
    response = await attempt();
    if (!transientStatuses.has(response.status)) return response;
    await response.body?.cancel();
  } catch (cause) {
    if (signal?.aborted) throw cause;
  }
  await new Promise((resolve) => setTimeout(resolve, 300));
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
      throw new Error("Die Suchseite ist zu groß.");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

const cantonCodes = new Set(["ZH", "BE", "LU", "UR", "SZ", "OW", "NW", "GL", "ZG", "FR", "SO", "BS", "BL", "SH", "AR", "AI", "SG", "GR", "AG", "TG", "TI", "VD", "VS", "NE", "GE", "JU"]);

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

export function parseJobsHtml(html: string, source: "jobs" | "jobup" = "jobs", onlyApprenticeships = false, now = new Date()): JobSearchResult[] {
  const document = load(html);
  const results = new Map<string, JobSearchResult>();
  const origin = source === "jobs" ? "https://www.jobs.ch" : "https://www.jobup.ch";
  const detailPattern = source === "jobs" ? /^\/de\/stellenangebote\/detail\/[a-z0-9-]+\/$/ : /^\/fr\/emplois\/detail\/[a-z0-9-]+\/$/;
  document('a[data-cy="job-link"]').each((_index, element) => {
    const link = document(element);
    const href = link.attr("href");
    const title = link.attr("title")?.trim();
    if (!href || !title) return;
    const url = new URL(href, origin);
    if (url.origin !== origin || !detailPattern.test(url.pathname)) return;
    const card = link.closest('[data-cy="serp-item"]');
    const labelled = (labels: string[]) => card.find("span").filter((_index, span) => labels.includes(document(span).text().trim())).first().siblings("p").text().trim();
    const place = labelled(["Arbeitsort:", "Lieu de travail:"]);
    const contract = labelled(["Vertragsart:", "Type de contrat:"]);
    const workload = parseWorkload(labelled(["Pensum:", "Taux d'activité:", "Taux d’activité:"]));
    const salary = parseSalary(labelled(["Lohn:", "Salaire:"]));
    const postedAt = parsePostedAt(card.find('[data-cy^="serp-item-"] p').first().text(), now);
    if (onlyApprenticeships && !/^(Lehrstelle|Lehre|Apprentissage)$/i.test(contract)) return;
    const company = card.find("p.fw_bold").last().text().trim();
    results.set(url.href, compact({
      title, company: company || undefined, location: place || undefined, url: url.href, source: sourceNames[source],
      contract: contract || undefined, jobType: jobTypeFromContract(contract, workload), ...workload, ...salary, postedAt,
      canton: cantonFromText(place), ...titleMeta(title, now),
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

export async function searchJobBatch(input: JobSearchInput): Promise<JobSearchBatch> {
  return searchSourceBatch(input, input.kind === "apprenticeship" ? "yousty" : "jobs");
}

async function searchSourceBatch(input: JobSearchInput, source: JobSource, limit = 25, signal = AbortSignal.timeout(45000)): Promise<JobSearchBatch> {
  if (!input.query.trim()) throw new Error("Bitte gib einen Beruf ein.");
  let cursor = input.cursor ?? { page: 1, offset: 0 };
  if (!Number.isInteger(cursor.page) || cursor.page < 1 || cursor.page > 1000 || !Number.isInteger(cursor.offset) || cursor.offset < 0 || cursor.offset > 1000) {
    throw new Error("Ungültige Ergebnisseite. Starte die Suche erneut.");
  }
  const url = await getSearchUrl(input, source, signal);
  const results = new Map<string, JobSearchResult>();
  const excluded = new Set(input.excludedUrls ?? []);
  for (let pagesRead = 0; pagesRead < 5; pagesRead++) {
    const pageUrl = new URL(url);
    if (cursor.page > 1) pageUrl.searchParams.set("page", String(cursor.page));
    let html: string;
    try {
      html = await getPublicHtml(pageUrl, signal);
    } catch (cause) {
      if (!results.size) throw cause;
      return { results: [...results.values()], nextCursor: cursor, warning: "Weitere Anzeigen konnten gerade nicht geladen werden. Mit Mehr laden kannst du es erneut versuchen." };
    }
    const allEntries = source === "yousty" ? parseYoustyHtml(html, youstyCanton(url)) : parseJobsHtml(html, source);
    const allowed = source !== "yousty" && input.kind === "apprenticeship" ? new Set(parseJobsHtml(html, source, true).map((result) => result.url)) : null;
    const entries = allEntries;
    const document = load(html);
    const empty = source === "yousty"
      ? /0 Lehrstellen|keine Lehrstellen/i.test(document("body").text())
      : /^Keine .+ Jobs - jobs\.ch$/i.test(document("title").text().trim()) || /0 (?:Jobs|Stellen)|keine (?:Jobs|Stellen)|aucun(?:e)? .*offre|0 offres/i.test(document("body").text());
    if (!entries.length && !empty) {
      if (!results.size) throw new Error("Die Treffer dieser Quelle lassen sich gerade nicht lesen. Bitte versuche es später wieder.");
      return { results: [...results.values()], nextCursor: cursor, warning: "Eine weitere Ergebnisseite konnte nicht gelesen werden. Bitte versuche Mehr laden erneut." };
    }
    const hasMore = hasNextPage(html, pageUrl, cursor.page);
    for (let index = cursor.offset; index < entries.length; index++) {
      const entry = entries[index];
      if (allowed && !allowed.has(entry.url)) continue;
      if (excluded.has(entry.url) || results.has(entry.url)) continue;
      results.set(entry.url, entry);
      if (results.size === limit) {
        const nextCursor = index + 1 < entries.length
          ? { page: cursor.page, offset: index + 1 }
          : hasMore ? { page: cursor.page + 1, offset: 0 } : null;
        return { results: [...results.values()], nextCursor };
      }
    }
    if (!hasMore) return { results: [...results.values()], nextCursor: null };
    cursor = { page: cursor.page + 1, offset: 0 };
  }
  return { results: [...results.values()], nextCursor: cursor };
}

/** Yousty list URLs look like /de-CH/lehrstellen/ZH/Zuerich/<slug>; the path carries the canton. */
export function youstyCanton(url: URL): string | undefined {
  const code = url.pathname.match(/^\/de-CH\/lehrstellen\/([A-Z]{2})\//)?.[1];
  return code && cantonCodes.has(code) ? code : undefined;
}

async function getSearchUrl(input: JobSearchInput, source: JobSource, signal?: AbortSignal): Promise<URL> {
  if (source === "yousty") return getApprenticeshipUrl(input, signal);
  const url = new URL(source === "jobs" ? "https://www.jobs.ch/de/stellenangebote/" : "https://www.jobup.ch/fr/emplois/");
  url.searchParams.set("term", input.kind === "apprenticeship" ? `${input.query} Lehrstelle` : input.query);
  if (input.location) url.searchParams.set("location", input.location);
  if (input.filters?.postedWithin) url.searchParams.set("publication-date", String(input.filters.postedWithin));
  if (input.filters?.jobTypes?.length === 1 && input.filters.jobTypes[0] === "temporaer") url.searchParams.set("employment-type", "1");
  return url;
}

export async function searchMultipleSources(input: MultiSourceSearchInput): Promise<MultiSourceSearchBatch> {
  if (!input.query.trim()) throw new Error("Bitte gib einen Beruf ein.");
  const enabled: JobSource[] = input.kind === "apprenticeship" ? ["yousty", "jobs"] : ["jobs", "jobup"];
  const cursors: SourceCursors = input.cursor ? { ...input.cursor } : { yousty: null, jobs: null, jobup: null };
  if (!input.cursor) for (const source of enabled) cursors[source] = { page: 1, offset: 0 };
  const known = mergeJobResults([], input.knownResults ?? []);
  let merged = known;
  const failed = new Set<JobSource>();
  const statuses = new Map<JobSource, { name: string; status: "ok" | "unavailable" | "exhausted"; count: number; message?: string }>();
  for (const source of enabled) statuses.set(source, { name: sourceNames[source], status: cursors[source] ? "ok" : "exhausted", count: 0 });
  const warnings: string[] = [];
  const signal = AbortSignal.timeout(45000);
  let succeeded = false;
  const pageSize = Number.isInteger(input.pageSize) ? Math.min(60, Math.max(10, input.pageSize!)) : 25;
  for (let round = 0; round < 4; round++) {
    const remaining = pageSize - (merged.length - known.length);
    const active = enabled.filter((source) => cursors[source] && !failed.has(source)).slice(0, remaining);
    if (remaining <= 0 || !active.length) break;
    const excludedUrls = [...new Set([...(input.excludedUrls ?? []), ...merged.flatMap((result) => listingSources(result).map((source) => source.url))])];
    const batches = await Promise.allSettled(active.map((source, index) => searchSourceBatch(
      { query: input.query, location: input.location, kind: input.kind, filters: input.filters, cursor: cursors[source]!, excludedUrls },
      source,
      Math.floor(remaining / active.length) + (index < remaining % active.length ? 1 : 0),
      signal,
    )));
    for (const [index, batch] of batches.entries()) {
      const source = active[index];
      if (batch.status === "rejected") {
        failed.add(source);
        const message = batch.reason instanceof Error ? batch.reason.message : "Quelle nicht erreichbar.";
        statuses.set(source, { name: sourceNames[source], status: "unavailable", count: 0, message });
        warnings.push(`${sourceNames[source]}: ${message}`);
        continue;
      }
      succeeded = true;
      merged = mergeJobResults(merged, batch.value.results);
      cursors[source] = batch.value.nextCursor;
      const count = statuses.get(source)!.count + batch.value.results.length;
      statuses.set(source, { name: sourceNames[source], status: batch.value.warning ? "unavailable" : cursors[source] ? "ok" : "exhausted", count, message: batch.value.warning });
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
    const details = link.find(".company-info strong");
    const location = details.eq(1).text().trim();
    results.set(url.href, compact({
      title, company: details.eq(0).text().trim() || undefined, location: location || undefined, url: url.href, source: "Yousty",
      contract: "Lehrstelle", jobType: "lehrstelle" as const, canton: cantonFromText(location) ?? defaultCanton, ...titleMeta(title, now),
    }));
  });
  return [...results.values()];
}

async function getApprenticeshipUrl(input: JobSearchInput, signal?: AbortSignal): Promise<URL> {
  const catalog = await getPublicHtml(new URL("https://www.yousty.ch/de-CH/lehrstellen/berufe"), signal);
  const slug = queryVariants(input.query).map((variant) => findProfessionSlug(catalog, variant)).find(Boolean);
  if (!slug) throw new Error("Dieser Lehrberuf wurde nicht gefunden. Nutze einen genauen Beruf, zum Beispiel Informatiker oder Kaufmann.");
  let prefix = "/de-CH/lehrstellen";
  if (input.location) {
    const locationUrl = new URL("https://www.yousty.ch/de-CH/lehrstellen");
    locationUrl.searchParams.set("user_place", input.location);
    await checkRobots(locationUrl, signal);
    const response = await fetch(locationUrl, { method: "HEAD", headers: { "User-Agent": userAgent }, redirect: "manual", cache: "no-store", signal: requestSignal(8000, signal) });
    const redirect = response.headers.get("location");
    const resolved = redirect ? new URL(redirect, locationUrl) : undefined;
    if (!resolved || resolved.origin !== locationUrl.origin || !/^\/de-CH\/lehrstellen\/[A-Z]{2}\/[a-zA-Z0-9-]+$/.test(resolved.pathname)) {
      throw new Error("Dieser Ort wurde nicht gefunden. Nutze einen Schweizer Ortsnamen, zum Beispiel Zürich.");
    }
    prefix = resolved.pathname;
  }
  return new URL(`${prefix}/${slug}`, "https://www.yousty.ch");
}

const searchCache = new Map<string, { expires: number; value: MultiSourceSearchBatch }>();

export function clearSearchCache() {
  searchCache.clear();
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
