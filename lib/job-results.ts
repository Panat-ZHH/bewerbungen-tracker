export interface JobSearchResult {
  title: string;
  company?: string;
  location?: string;
  url: string;
  source: string;
  sources?: { name: string; url: string }[];
  years?: string[];
}

export function originalSourceName(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return undefined;
    if (url.hostname === "www.jobs.ch" && /^\/de\/stellenangebote\/detail\/[a-z0-9-]+\/$/.test(url.pathname)) return "jobs.ch";
    if (url.hostname === "www.jobup.ch" && /^\/fr\/emplois\/detail\/[a-z0-9-]+\/$/.test(url.pathname)) return "jobup.ch";
    if (url.hostname === "www.yousty.ch" && /^\/de-CH\/lehrstellen\/profile\/\d+-[a-z0-9-]+$/.test(url.pathname)) return "Yousty";
  } catch {
    return undefined;
  }
}

function normalize(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/ß/g, "ss").replace(/[^a-z0-9]+/g, " ").trim();
}

function normalizedTitle(title: string) {
  return normalize(title
    .replace(/\((?:[mwfdh]|div|all genders)(?:[\s/.,-]*(?:[mwfdh]|div|all genders))*[\s.]*\)/gi, "")
    .replace(/(?:\/|:)in\b/gi, "")
    .replace(/\b(?:lehrstelle[n]?|lehre|ausbildungsplatz|als|zum|zur|ab|start|lehrbeginn)\b/gi, "")
    .replace(/\b20\d{2}\b/g, ""));
}

function identity(result: JobSearchResult): string | undefined {
  if (!result.company?.trim() || !result.location?.trim()) return undefined;
  const company = normalize(result.company).replace(/\s+(ag|gmbh|sa|sarl|ltd)$/, "");
  const location = normalize(result.location.replace(/^\d{4}\s+/, "").replace(/\s+(?:ZH|BE|BS|BL|AG|SG|LU|VD|GE|ZG|SZ|SO|TG|TI|FR|NE|JU|VS|GR|SH|GL|NW|OW|UR|AR|AI)$/i, ""));
  return `${company}|${location}|${normalizedTitle(result.title)}`;
}

function listingYears(result: JobSearchResult): string[] {
  return [...new Set([...(result.years ?? []), ...(result.title.match(/\b20\d{2}\b/g) ?? [])])].sort();
}

export function listingSources(result: JobSearchResult) {
  const links = new Map<string, { name: string; url: string }>();
  for (const source of [{ name: result.source, url: result.url }, ...(result.sources ?? [])]) links.set(source.url, source);
  return [...links.values()];
}

export function mergeJobResults(existing: JobSearchResult[], incoming: JobSearchResult[]): JobSearchResult[] {
  const merged = existing.map((result) => ({ ...result, sources: listingSources(result), years: listingYears(result) }));
  for (const result of incoming) {
    const links = listingSources(result);
    let index = merged.findIndex((current) => listingSources(current).some((source) => links.some((link) => link.url === source.url)));
    if (index < 0) {
      const key = identity(result);
      const year = listingYears(result).join(",");
      const candidates = key ? merged.map((current, currentIndex) => {
        const currentYear = listingYears(current).join(",");
        return identity(current) === key && !(year && currentYear && year !== currentYear) ? currentIndex : -1;
      }).filter((candidate) => candidate >= 0) : [];
      if (candidates.length === 1) index = candidates[0];
    }
    if (index < 0) {
      merged.push({ ...result, sources: links, years: listingYears(result) });
    } else {
      const current = merged[index];
      const sources = new Map([...listingSources(current), ...links].map((source) => [source.url, source]));
      merged[index] = { ...current, company: current.company || result.company, location: current.location || result.location, sources: [...sources.values()], years: [...new Set([...listingYears(current), ...listingYears(result)])].sort() };
    }
  }
  return merged;
}