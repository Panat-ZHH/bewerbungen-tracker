// Adapter between the job-search UI and the filter engine in lib/job-filters (single source of truth).
import type { EnrichedJob, JobFilters, JobPreset, JobSearchState, JobSort, JobType, PostedWithin, RankedJob } from "../../lib/job-filters/types.ts";
import { emptyFilters } from "../../lib/job-filters/types.ts";
import { expandQuery, fold as coreFold, normalize } from "../../lib/job-filters/query.ts";
import { rankJobs as coreRank } from "../../lib/job-filters/rank.ts";
import { activeFilterCount as coreActiveCount, applyJobFilters } from "../../lib/job-filters/filter.ts";
import { computeFacets as coreFacets, type Facets } from "../../lib/job-filters/facets.ts";
import { sortJobs as coreSort, SORT_LABELS } from "../../lib/job-filters/sort.ts";
import * as store from "../../lib/job-filters/storage.ts";
import { paramsToState, stateToParams, SOURCE_NAMES } from "../../lib/job-filters/url.ts";
// cantons only: the localities directory (lib/geo/places.ts) stays on the server, distances arrive on the results
import { CANTON_CODES, cantonInText } from "../../lib/geo/cantons.ts";
import { DEFAULT_RADIUS_KM, EDUCATION_LABELS, FIELDS, JOB_TYPE_LABELS, LANGUAGE_LABELS, POSTED_WITHIN_OPTIONS, RADIUS_OPTIONS, REMOTE_LABELS, effectiveRadiusKm, formatDistance, postedWithinLabel, radiusLabel } from "../../lib/job-filters/taxonomy.ts";

export { emptyFilters, paramsToState, stateToParams, SOURCE_NAMES, SORT_LABELS, JOB_TYPE_LABELS, EDUCATION_LABELS, LANGUAGE_LABELS, REMOTE_LABELS, RADIUS_OPTIONS, DEFAULT_RADIUS_KM, effectiveRadiusKm, formatDistance, radiusLabel };
export type { EnrichedJob, JobFilters, JobPreset, JobSearchState, JobSort, JobType, RankedJob, Facets, PostedWithin };

export const FIELD_LABELS: Record<string, string> = Object.fromEntries(FIELDS.map((f) => [f.id, f.label]));
export const POSTED_OPTIONS: { value: PostedWithin; label: string }[] = POSTED_WITHIN_OPTIONS.map((value) => ({ value, label: postedWithinLabel(value) }));
export const CANTONS = [...CANTON_CODES].sort();
export const fold = coreFold;

/** Synonyms the engine also searches for (shown as a hint under the search field). */
export function synonymHints(query: string): string[] {
  const words = new Set(normalize(query).split(" "));
  const out = new Set<string>();
  for (const hint of expandQuery(query).hints) for (const synonym of hint.synonyms) if (!words.has(normalize(synonym))) out.add(synonym);
  return [...out].slice(0, 5);
}

const normalizeCompare = (value: string) => normalize(value);
export function suggestQueries(prefix: string, limit = 6): string[] {
  const p = normalizeCompare(prefix);
  if (p.length < 2) return [];
  const pool = ["Informatiker/in EFZ", "Kaufmann/-frau EFZ", "Detailhandelsfachmann/-frau", "Fachmann/-frau Gesundheit", "Polymechaniker/in", "Elektroinstallateur/in", "Logistiker/in", "Koch/Köchin", "Maurer/in", "Zeichner/in", "Mediamatiker/in", "Praktikum Marketing", "Sachbearbeiter/in", "Projektleiter/in", "Software Engineer"];
  return pool.filter((item) => normalizeCompare(item).includes(p)).slice(0, limit);
}

export function jobCanton(job: EnrichedJob): string | undefined {
  return job.canton?.toUpperCase() ?? cantonInText(job.location);
}

/** Missing data never excludes a listing. */
export function applyFilters(jobs: EnrichedJob[], f: JobFilters, savedUrls: Set<string>, now = Date.now()): EnrichedJob[] {
  return applyJobFilters(jobs, f, { savedUrls, now });
}
export function rankJobs(jobs: EnrichedJob[], query: string, now = Date.now()): RankedJob[] {
  return coreRank(jobs, { query }, now);
}
export const sortJobs = coreSort;
export function computeFacets(jobs: EnrichedJob[], filters: JobFilters = emptyFilters(), savedUrls: Set<string> = new Set()): Facets {
  return coreFacets(jobs, filters, { savedUrls });
}
export const activeFilterCount = coreActiveCount;

export function companyOptions(jobs: EnrichedJob[], limit = 40): string[] {
  const counts = new Map<string, number>();
  for (const job of jobs) if (job.company) counts.set(job.company, (counts.get(job.company) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "de")).slice(0, limit).map(([name]) => name);
}

// ---- recent searches (query strings) and presets: persisted by lib/job-filters/storage ----
const recentState = (query: string): JobSearchState => ({ query, filters: emptyFilters(), sort: "relevance" });
export const loadRecent = (): string[] => store.loadRecent().map((entry) => entry.state.query);
export function addRecent(query: string): string[] { return store.addRecent(recentState(query.trim())).map((entry) => entry.state.query); }
export const clearRecent = () => store.clearRecent();
export const loadPresets = store.loadPresets;
export const savePreset = (name: string, state: JobSearchState) => store.savePreset(name, state);
export const deletePreset = (id: string) => store.deletePreset(id);
