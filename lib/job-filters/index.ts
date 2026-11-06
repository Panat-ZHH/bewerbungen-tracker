// Barrel + the one-call pipeline used by the UI: dedupe -> filter -> rank -> sort (+ facets).
import type { EnrichedJob, JobSearchState, RankedJob } from "./types.ts";
import { dedupeJobs } from "./dedupe.ts";
import { applyJobFilters } from "./filter.ts";
import type { FilterOptions } from "./filter.ts";
import { rankJobs } from "./rank.ts";
import { sortJobs } from "./sort.ts";
import { computeFacets } from "./facets.ts";
import type { Facets } from "./facets.ts";

export * from "./types.ts";
export * from "./query.ts";
export * from "./geo.ts";
export * from "./taxonomy.ts";
export * from "./filter.ts";
export * from "./rank.ts";
export * from "./sort.ts";
export * from "./dedupe.ts";
export * from "./url.ts";
export * from "./storage.ts";
export * from "./facets.ts";

export function searchJobs(jobs: EnrichedJob[], state: JobSearchState, options: FilterOptions = {}): { results: RankedJob[]; facets: Facets; total: number } {
  const unique = dedupeJobs(jobs);
  const filtered = applyJobFilters(unique, state.filters, options);
  const ranked = sortJobs(rankJobs(filtered, state, options.now ?? Date.now()), state.sort);
  return { results: ranked, facets: computeFacets(rankJobs(unique, state, options.now ?? Date.now()).map((r) => r.job), state.filters, options), total: ranked.length };
}
