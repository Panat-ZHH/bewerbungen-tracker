import { load } from "cheerio";
import robotsParser from "robots-parser";
import { listingSources, mergeJobResults, type JobSearchResult } from "./job-results.ts";

export type { JobSearchResult } from "./job-results.ts";

export type SearchKind = "job" | "apprenticeship";

export interface JobSearchInput {
  query: string;
  location: string;
  kind: SearchKind;
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
}

export interface MultiSourceSearchBatch {
  results: JobSearchResult[];
  updates: JobSearchResult[];
  nextCursor: SourceCursors | null;
  sources: { name: string; status: "ok" | "unavailable" | "exhausted"; count: number }[];
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

async function getPublicHtml(url: URL, signal?: AbortSignal): Promise<string> {
  let current = url;
  let response: Response | undefined;
  for (let redirects = 0; redirects <= 3; redirects++) {
    await checkRobots(current, signal);
    response = await fetch(current, {
      headers: { "User-Agent": userAgent, Accept: "text/html" },
      signal: requestSignal(12000, signal),
      cache: "no-store",
      redirect: "manual",
    });
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

export function parseJobsHtml(html: string, source: "jobs" | "jobup" = "jobs", onlyApprenticeships = false): JobSearchResult[] {
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
    const place = card.find("span").filter((_index, span) => ["Arbeitsort:", "Lieu de travail:"].includes(document(span).text().trim())).first().siblings("p").text().trim();
    const contract = card.find("span").filter((_index, span) => ["Vertragsart:", "Type de contrat:"].includes(document(span).text().trim())).first().siblings("p").text().trim();
    if (onlyApprenticeships && !/^(Lehrstelle|Lehre|Apprentissage)$/i.test(contract)) return;
    const company = card.find("p.fw_bold").last().text().trim();
    results.set(url.href, { title, company: company || undefined, location: place || undefined, url: url.href, source: sourceNames[source] });
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
    const allEntries = source === "yousty" ? parseYoustyHtml(html) : parseJobsHtml(html, source);
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

async function getSearchUrl(input: JobSearchInput, source: JobSource, signal?: AbortSignal): Promise<URL> {
  if (source === "yousty") return getApprenticeshipUrl(input, signal);
  const url = new URL(source === "jobs" ? "https://www.jobs.ch/de/stellenangebote/" : "https://www.jobup.ch/fr/emplois/");
  url.searchParams.set("term", input.kind === "apprenticeship" ? `${input.query} Lehrstelle` : input.query);
  if (input.location) url.searchParams.set("location", input.location);
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
  const statuses = new Map<JobSource, { name: string; status: "ok" | "unavailable" | "exhausted"; count: number }>();
  for (const source of enabled) statuses.set(source, { name: sourceNames[source], status: cursors[source] ? "ok" : "exhausted", count: 0 });
  const warnings: string[] = [];
  const signal = AbortSignal.timeout(45000);
  let succeeded = false;
  for (let round = 0; round < 4; round++) {
    const remaining = 25 - (merged.length - known.length);
    const active = enabled.filter((source) => cursors[source] && !failed.has(source)).slice(0, remaining);
    if (remaining <= 0 || !active.length) break;
    const excludedUrls = [...new Set([...(input.excludedUrls ?? []), ...merged.flatMap((result) => listingSources(result).map((source) => source.url))])];
    const batches = await Promise.allSettled(active.map((source, index) => searchSourceBatch(
      { query: input.query, location: input.location, kind: input.kind, cursor: cursors[source]!, excludedUrls },
      source,
      Math.floor(remaining / active.length) + (index < remaining % active.length ? 1 : 0),
      signal,
    )));
    for (const [index, batch] of batches.entries()) {
      const source = active[index];
      if (batch.status === "rejected") {
        failed.add(source);
        statuses.set(source, { name: sourceNames[source], status: "unavailable", count: 0 });
        warnings.push(`${sourceNames[source]}: ${batch.reason instanceof Error ? batch.reason.message : "Quelle nicht erreichbar."}`);
        continue;
      }
      succeeded = true;
      merged = mergeJobResults(merged, batch.value.results);
      cursors[source] = batch.value.nextCursor;
      const count = statuses.get(source)!.count + batch.value.results.length;
      statuses.set(source, { name: sourceNames[source], status: batch.value.warning ? "unavailable" : cursors[source] ? "ok" : "exhausted", count });
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

export function parseYoustyHtml(html: string): JobSearchResult[] {
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
    results.set(url.href, { title, company: details.eq(0).text().trim() || undefined, location: details.eq(1).text().trim() || undefined, url: url.href, source: "Yousty" });
  });
  return [...results.values()];
}

async function getApprenticeshipUrl(input: JobSearchInput, signal?: AbortSignal): Promise<URL> {
  const catalog = await getPublicHtml(new URL("https://www.yousty.ch/de-CH/lehrstellen/berufe"), signal);
  const slug = findProfessionSlug(catalog, input.query);
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