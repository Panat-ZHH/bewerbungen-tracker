import { load } from "cheerio";
import robotsParser from "robots-parser";

export type SearchKind = "job" | "apprenticeship";

export interface JobSearchInput {
  query: string;
  location: string;
  kind: SearchKind;
}

export interface JobSearchResult {
  title: string;
  company?: string;
  location?: string;
  url: string;
  source: string;
}

const userAgent = "WendApply/1.0";
const robotsCache = new Map<string, { expires: number; rules: ReturnType<typeof robotsParser> }>();

async function checkRobots(url: URL) {
  const robotsUrl = new URL("/robots.txt", url);
  const cached = robotsCache.get(url.origin);
  if (cached && cached.expires > Date.now()) {
    if (cached.rules.isAllowed(url.href, userAgent) === false) throw new Error("Diese Quelle erlaubt den automatischen Abruf dieser Suche nicht.");
    return;
  }
  const robotsResponse = await fetch(robotsUrl, {
    headers: { "User-Agent": userAgent },
    signal: AbortSignal.timeout(8000),
    cache: "no-store",
    redirect: "error",
  });
  if (!robotsResponse.ok) throw new Error("Die Regeln der Quelle konnten nicht geprüft werden.");
  const robots = robotsParser(robotsUrl.href, await robotsResponse.text());
  robotsCache.set(url.origin, { rules: robots, expires: Date.now() + 3600000 });
  if (robots.isAllowed(url.href, userAgent) === false) throw new Error("Diese Quelle erlaubt den automatischen Abruf dieser Suche nicht.");
}

async function getPublicHtml(url: URL): Promise<string> {
  await checkRobots(url);
  const response = await fetch(url, {
    headers: { "User-Agent": userAgent, Accept: "text/html" },
    signal: AbortSignal.timeout(12000),
    cache: "no-store",
    redirect: "error",
  });
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

export function parseJobsHtml(html: string): JobSearchResult[] {
  const document = load(html);
  const results = new Map<string, JobSearchResult>();
  document('a[data-cy="job-link"]').each((_index, element) => {
    const link = document(element);
    const href = link.attr("href");
    const title = link.attr("title")?.trim();
    if (!href || !title) return;
    const url = new URL(href, "https://www.jobs.ch");
    if (url.origin !== "https://www.jobs.ch" || !/^\/de\/stellenangebote\/detail\/[a-z0-9-]+\/$/.test(url.pathname)) return;
    const card = link.closest('[data-cy="serp-item"]');
    const place = card.find("span").filter((_index, span) => document(span).text().trim() === "Arbeitsort:").first().siblings("p").text().trim();
    const company = card.find("p.fw_bold").last().text().trim();
    results.set(url.href, { title, company: company || undefined, location: place || undefined, url: url.href, source: "jobs.ch" });
  });
  return [...results.values()].slice(0, 20);
}

export async function searchJobs(input: JobSearchInput): Promise<JobSearchResult[]> {
  if (!input.query.trim()) throw new Error("Bitte gib einen Beruf ein.");
  if (input.kind === "apprenticeship") return searchApprenticeships(input);
  const url = new URL("https://www.jobs.ch/de/stellenangebote/");
  url.searchParams.set("term", input.query);
  if (input.location) url.searchParams.set("location", input.location);
  const html = await getPublicHtml(url);
  const results = parseJobsHtml(html);
  const document = load(html);
  const emptyTitle = /^Keine .+ Jobs - jobs\.ch$/i.test(document("title").text().trim());
  if (!results.length && !emptyTitle && !/0 (?:Jobs|Stellen)|keine (?:Jobs|Stellen)/i.test(document("main").text())) {
    throw new Error("Die Treffer dieser Quelle lassen sich gerade nicht lesen. Bitte versuche es später wieder.");
  }
  return results;
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
  return [...results.values()].slice(0, 20);
}

async function searchApprenticeships(input: JobSearchInput): Promise<JobSearchResult[]> {
  const catalog = await getPublicHtml(new URL("https://www.yousty.ch/de-CH/lehrstellen/berufe"));
  const slug = findProfessionSlug(catalog, input.query);
  if (!slug) throw new Error("Dieser Lehrberuf wurde nicht gefunden. Nutze einen genauen Beruf, zum Beispiel Informatiker oder Kaufmann.");
  let prefix = "/de-CH/lehrstellen";
  if (input.location) {
    const locationUrl = new URL("https://www.yousty.ch/de-CH/lehrstellen");
    locationUrl.searchParams.set("user_place", input.location);
    await checkRobots(locationUrl);
    const response = await fetch(locationUrl, { method: "HEAD", headers: { "User-Agent": userAgent }, redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(8000) });
    const redirect = response.headers.get("location");
    const resolved = redirect ? new URL(redirect, locationUrl) : undefined;
    if (!resolved || resolved.origin !== locationUrl.origin || !/^\/de-CH\/lehrstellen\/[A-Z]{2}\/[a-zA-Z0-9-]+$/.test(resolved.pathname)) {
      throw new Error("Dieser Ort wurde nicht gefunden. Nutze einen Schweizer Ortsnamen, zum Beispiel Zürich.");
    }
    prefix = resolved.pathname;
  }
  const html = await getPublicHtml(new URL(`${prefix}/${slug}`, "https://www.yousty.ch"));
  const results = parseYoustyHtml(html);
  if (!results.length && !/0 Lehrstellen|keine Lehrstellen/i.test(load(html)("body").text())) {
    throw new Error("Die Lehrstellen dieser Quelle lassen sich gerade nicht lesen.");
  }
  return results;
}