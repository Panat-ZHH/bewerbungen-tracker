// Cross-source de-duplication that keeps every source link and all enrichment fields.
import type { EnrichedJob } from "./types.ts";
import { fold } from "./query.ts";
import { listingSources } from "../job-results.ts";

function titleKey(title: string) {
  return fold(title
    .replace(/\((?:[mwfdh]|div|all genders)(?:[\s/.,-]*(?:[mwfdh]|div|all genders))*[\s.]*\)/gi, "")
    .replace(/[mwfd]\s*\/\s*[mwfd](?:\s*\/\s*[mwfd])?/gi, "")
    .replace(/(?:\/|:|\*)(?:in|innen)\b/gi, "")
    .replace(/\b(?:lehrstelle[n]?|lehre|ausbildungsplatz|ausbildung|als|zum|zur|ab|start|lehrbeginn|efz|eba|stelle|job|gesucht|100\s*%|\d{2,3}\s*-\s*\d{2,3}\s*%)\b/gi, "")
    .replace(/\b20\d{2}\b/g, ""))
    .split(" ")
    .map((token) => (token === "kauffrau" ? "kaufmann" : token === "fachfrau" ? "fachmann" : token))
    .filter((token) => token && !["in", "er", "frau", "mann"].includes(token))
    .filter((token, index, all) => all.indexOf(token) === index)
    .sort()
    .join("");
}
const companyKey = (company?: string) => fold(company ?? "").replace(/\b(?:ag|gmbh|sa|sarl|ltd|sagl|inc|schweiz|suisse|switzerland)\b/g, "").replace(/\s+/g, "");
const cityKey = (location?: string) => fold((location ?? "").replace(/\b[1-9]\d{3}\b/g, "").replace(/\b(?:ZH|BE|BS|BL|AG|SG|LU|VD|GE|ZG|SZ|SO|TG|TI|FR|NE|JU|VS|GR|SH|GL|NW|OW|UR|AR|AI)\b/g, "")).replace(/\s+/g, "");
const years = (job: EnrichedJob) => [...new Set([...(job.years ?? []), ...(job.title.match(/\b20\d{2}\b/g) ?? [])])].sort();

function sameListing(a: EnrichedJob, b: EnrichedJob): boolean {
  if (listingSources(a).some((x) => listingSources(b).some((y) => x.url === y.url))) return true;
  const ca = companyKey(a.company), cb = companyKey(b.company);
  if (!ca || ca !== cb) return false;
  const ta = titleKey(a.title), tb = titleKey(b.title);
  if (!ta || ta !== tb) return false;
  const la = cityKey(a.location), lb = cityKey(b.location);
  if (la && lb && la !== lb) return false;
  const ya = years(a).join(","), yb = years(b).join(",");
  if (ya && yb && ya !== yb) return false;
  return true;
}

function combine(current: EnrichedJob, extra: EnrichedJob): EnrichedJob {
  const out: EnrichedJob = { ...current };
  for (const [key, value] of Object.entries(extra)) {
    if (value === undefined || key === "sources" || key === "years" || key === "url" || key === "source" || key === "title") continue;
    const existing = (out as unknown as Record<string, unknown>)[key];
    if (existing === undefined || existing === "") (out as unknown as Record<string, unknown>)[key] = value;
  }
  // prefer the longer snippet and the earlier posting date
  if ((extra.snippet?.length ?? 0) > (current.snippet?.length ?? 0)) out.snippet = extra.snippet;
  if (extra.postedAt && current.postedAt && Date.parse(extra.postedAt) > Date.parse(current.postedAt)) out.postedAt = extra.postedAt;
  const sources = new Map([...listingSources(current), ...listingSources(extra)].map((s) => [s.url, s]));
  out.sources = [...sources.values()];
  out.years = [...new Set([...years(current), ...years(extra)])].sort();
  return out;
}

/** Merge duplicate listings (same URL, or same company + normalised title + compatible place/year). Order = first occurrence. */
export function dedupeJobs(jobs: EnrichedJob[]): EnrichedJob[] {
  const out: EnrichedJob[] = [];
  for (const job of jobs) {
    const index = out.findIndex((existing) => sameListing(existing, job));
    if (index < 0) out.push({ ...job, sources: listingSources(job), years: years(job) });
    else out[index] = combine(out[index], job);
  }
  return out;
}
