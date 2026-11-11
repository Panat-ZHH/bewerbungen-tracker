import type { JobSort, RankedJob } from "./types.ts";
import { startYearOf, enrichJob } from "./taxonomy.ts";

export const SORT_LABELS: Record<JobSort, string> = { relevance: "Relevanz", distance: "Nächste zuerst", newest: "Neueste zuerst", company: "Firma A–Z", location: "Ort A–Z", start: "Frühester Beginn" };
export const SORT_OPTIONS = Object.keys(SORT_LABELS) as JobSort[];
const collator = new Intl.Collator("de-CH", { sensitivity: "base", numeric: true });
const time = (value?: string) => { const t = value ? Date.parse(value) : NaN; return Number.isNaN(t) ? undefined : t; };

/** Stable sort of ranked listings; missing values always sort last. Input is not mutated. */
export function sortJobs(ranked: RankedJob[], sort: JobSort): RankedJob[] {
  const indexed = ranked.map((item, index) => ({ item, index }));
  const compareMissing = <T,>(a: T | undefined, b: T | undefined, cmp: (x: T, y: T) => number): number | undefined => {
    if (a === undefined && b === undefined) return undefined;
    if (a === undefined) return 1;
    if (b === undefined) return -1;
    return cmp(a, b) || undefined;
  };
  const cmp = (a: { item: RankedJob; index: number }, b: { item: RankedJob; index: number }): number => {
    const ja = enrichJob(a.item.job), jb = enrichJob(b.item.job);
    let result: number | undefined;
    // distance to the searched place (from the search API); equal distances keep the relevance order
    if (sort === "distance") result = compareMissing(ja.distanceKm, jb.distanceKm, (x, y) => x - y) ?? (b.item.score - a.item.score || undefined);
    else if (sort === "newest") result = compareMissing(time(ja.postedAt), time(jb.postedAt), (x, y) => y - x);
    else if (sort === "company") result = compareMissing(ja.company?.trim() || undefined, jb.company?.trim() || undefined, (x, y) => collator.compare(x, y));
    else if (sort === "location") result = compareMissing(ja.location?.trim() || undefined, jb.location?.trim() || undefined, (x, y) => collator.compare(x, y));
    else if (sort === "start") result = compareMissing(startYearOf(ja), startYearOf(jb), (x, y) => x - y);
    else result = b.item.score - a.item.score || undefined;
    return result ?? a.index - b.index;
  };
  return indexed.sort(cmp).map(({ item }) => item);
}
