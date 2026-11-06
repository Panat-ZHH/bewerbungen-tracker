// Typo-tolerant relevance ranking with highlight ranges. Stable: ties keep input order.
import type { EnrichedJob, JobSearchState, RankedJob } from "./types.ts";
import { expandQuery, fold, tokenMatch, tokenSpans } from "./query.ts";
import type { QueryTerm, TokenSpan } from "./query.ts";
import { enrichJob } from "./taxonomy.ts";

type FieldName = RankedJob["matches"][number]["field"];
const WEIGHTS: Record<FieldName, number> = { title: 1, company: 0.6, location: 0.5, snippet: 0.25 };
const DAY = 86_400_000;

function matchTerm(term: QueryTerm, spans: TokenSpan[]): { score: number; ranges: [number, number][] } {
  let best = { score: 0, ranges: [] as [number, number][] };
  for (const alt of term.alts) {
    let total = 0;
    const ranges: [number, number][] = [];
    let ok = true;
    for (const token of alt.tokens) {
      let top = 0;
      let topSpan: TokenSpan | undefined;
      for (const span of spans) {
        const q = tokenMatch(token, span.text);
        if (q > top) { top = q; topSpan = span; }
      }
      if (!top) { ok = false; break; }
      total += top;
      if (topSpan) ranges.push([topSpan.start, topSpan.end]);
    }
    if (!ok) continue;
    const score = (total / alt.tokens.length) * alt.weight;
    if (score > best.score) best = { score, ranges };
  }
  return best;
}

function mergeRanges(ranges: [number, number][]): [number, number][] {
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else out.push([r[0], r[1]]);
  }
  return out;
}

export function recencyBoost(job: EnrichedJob, now: number): number {
  const t = job.postedAt ? Date.parse(job.postedAt) : NaN;
  if (Number.isNaN(t)) return 0;
  return 0.15 * Math.max(0, 1 - Math.max(0, now - t) / (30 * DAY));
}

/**
 * Rank listings for a query. Scoring: title 1.0 > company 0.6 > location 0.5 > snippet 0.25, exact > prefix > substring > typo,
 * synonyms count 0.8, plus phrase boosts and recency (<=0.15). Terms are ANDed across all fields; listings matching less
 * than half of the terms (or none) are dropped. An empty query keeps everything (ordered by recency, then input order).
 */
export function rankJobs(jobs: EnrichedJob[], state: Pick<JobSearchState, "query">, now: number = Date.now()): RankedJob[] {
  const query = expandQuery(state.query);
  const result: (RankedJob & { index: number })[] = [];
  jobs.forEach((raw, index) => {
    const job = enrichJob(raw);
    const boost = recencyBoost(job, now);
    if (!query.terms.length) { result.push({ job: raw, score: round(boost), matches: [], index }); return; }
    const fields: Record<FieldName, string | undefined> = { title: job.title, company: job.company, location: job.location, snippet: job.snippet };
    const spans = {} as Record<FieldName, TokenSpan[]>;
    for (const name of Object.keys(fields) as FieldName[]) spans[name] = fields[name] ? tokenSpans(fields[name]!) : [];
    const ranges: Record<FieldName, [number, number][]> = { title: [], company: [], location: [], snippet: [] };
    let sum = 0;
    let matched = 0;
    for (const term of query.terms) {
      let top = 0;
      for (const name of Object.keys(WEIGHTS) as FieldName[]) {
        const m = matchTerm(term, spans[name]);
        if (!m.score) continue;
        ranges[name].push(...m.ranges);
        top = Math.max(top, m.score * WEIGHTS[name]);
      }
      if (top > 0) { matched += 1; sum += top; }
    }
    if (!matched || (query.terms.length > 1 && matched < query.terms.length / 2)) return;
    let score = sum / query.terms.length + (matched / query.terms.length) * 0.25;
    const title = fold(job.title);
    if (title === query.phrase) score += 0.4;
    else if (title.startsWith(query.phrase)) score += 0.25;
    else if (query.terms.length > 1 && title.includes(query.phrase)) score += 0.15;
    score += boost;
    const matches = (Object.keys(ranges) as FieldName[]).filter((f) => ranges[f].length).map((f) => ({ field: f, ranges: mergeRanges(ranges[f]) }));
    result.push({ job: raw, score: round(score), matches, index });
  });
  return result.sort((a, b) => b.score - a.score || a.index - b.index).map(({ job, score, matches }) => ({ job, score, matches }));
}

const round = (n: number) => Math.round(n * 10_000) / 10_000;

/** Split text into highlighted / plain segments for rendering. */
export function highlightSegments(text: string, ranges: [number, number][] = []): { text: string; hit: boolean }[] {
  const out: { text: string; hit: boolean }[] = [];
  let at = 0;
  for (const [start, end] of mergeRanges(ranges)) {
    if (start > at) out.push({ text: text.slice(at, start), hit: false });
    out.push({ text: text.slice(start, end), hit: true });
    at = end;
  }
  if (at < text.length) out.push({ text: text.slice(at), hit: false });
  return out.length ? out : [{ text, hit: false }];
}
