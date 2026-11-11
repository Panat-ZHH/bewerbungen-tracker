// Client side filtering of enriched listings. Missing data keeps a listing unless the filter is marked strict.
import type { EnrichedJob, JobFilters } from "./types.ts";
import { fold } from "./query.ts";
import { detectJobTypes, effectiveRadiusKm, enrichJob, startYearOf } from "./taxonomy.ts";

export type StrictMap = Partial<Record<keyof JobFilters, boolean>>;
export interface FilterOptions {
  /** true = every filter drops listings with missing data; or choose per filter key. */
  strict?: boolean | StrictMap;
  now?: number;
  /** URLs (or any source URL) the user already saved. Used by onlyNew / hideSaved. */
  savedUrls?: Set<string> | string[];
  /** Alternative to savedUrls. */
  isSaved?: (job: EnrichedJob) => boolean;
}

const DAY = 86_400_000;
const isStrict = (options: FilterOptions, key: keyof JobFilters) => (typeof options.strict === "boolean" ? options.strict : !!options.strict?.[key]);
export const companyKey = (value: string | undefined) => fold(value ?? "").replace(/\s+(ag|gmbh|sa|sarl|ltd|sagl|inc)$/, "");

export function isSavedJob(job: EnrichedJob, options: FilterOptions): boolean {
  if (options.isSaved) return options.isSaved(job);
  if (!options.savedUrls) return false;
  const saved = options.savedUrls instanceof Set ? options.savedUrls : new Set(options.savedUrls);
  return [job.url, ...(job.sources ?? []).map((s) => s.url)].some((url) => saved.has(url));
}

/** True if a listing passes one named filter (used by facets to compute disjunctive counts). */
export function passes(job: EnrichedJob, filters: JobFilters, key: keyof JobFilters, options: FilterOptions = {}): boolean {
  const j = enrichJob(job);
  const strict = isStrict(options, key);
  const missing = () => !strict;
  switch (key) {
    case "radiusKm": {
      // Without a place nothing is filtered by distance (whole Switzerland). With a place the search API has geocoded the
      // listing and put `distanceKm` / `inPlace` on it (one place computes distances); here only the chosen radius is applied,
      // so narrowing the radius works without a new search. No radius chosen = default 10 km; 0 = "Nur dieser Ort".
      if (!filters.location.trim()) return true;
      if (j.distanceKm === undefined) return missing();
      if (j.inPlace) return true;
      const radius = effectiveRadiusKm(filters);
      return radius > 0 && j.distanceKm <= radius;
    }
    case "cantons":
      if (!filters.cantons.length) return true;
      return j.canton ? filters.cantons.map((c) => c.toUpperCase()).includes(j.canton.toUpperCase()) : missing();
    case "jobTypes": {
      if (!filters.jobTypes.length) return true;
      const types = detectJobTypes(j);
      return types.length ? types.some((t) => filters.jobTypes.includes(t)) : missing();
    }
    case "workloadMin":
    case "workloadMax": {
      if (filters.workloadMin === undefined && filters.workloadMax === undefined) return true;
      if (j.workloadMin === undefined && j.workloadMax === undefined) return missing();
      const lo = j.workloadMin ?? j.workloadMax!;
      const hi = j.workloadMax ?? j.workloadMin!;
      // ranges overlap
      return hi >= (filters.workloadMin ?? 0) && lo <= (filters.workloadMax ?? 100);
    }
    case "fields":
      if (!filters.fields.length) return true;
      return j.field ? filters.fields.includes(j.field) : missing();
    case "startYear": {
      if (filters.startYear === undefined) return true;
      const year = startYearOf(j);
      return year === undefined ? missing() : year === filters.startYear;
    }
    case "education":
      if (!filters.education.length) return true;
      return j.education ? filters.education.includes(j.education) : missing();
    case "languages":
      if (!filters.languages.length) return true;
      return j.language ? filters.languages.includes(j.language) : missing();
    case "companies":
      if (!filters.companies.length) return true;
      return j.company ? filters.companies.map(companyKey).includes(companyKey(j.company)) : false;
    case "sources": {
      if (!filters.sources.length) return true;
      const names = [j.source, ...(j.sources ?? []).map((s) => s.name)];
      return names.some((n) => filters.sources.includes(n));
    }
    case "postedWithin": {
      if (!filters.postedWithin) return true;
      const t = j.postedAt ? Date.parse(j.postedAt) : NaN;
      if (Number.isNaN(t)) return missing();
      return (options.now ?? Date.now()) - t <= filters.postedWithin * DAY + DAY / 2;
    }
    case "remote":
      if (!filters.remote) return true;
      if (!j.remote) return filters.remote === "onsite" ? true : missing();
      return j.remote === filters.remote;
    case "salaryMin": {
      if (filters.salaryMin === undefined) return true;
      const top = j.salaryMax ?? j.salaryMin;
      return top === undefined ? missing() : top >= filters.salaryMin;
    }
    case "onlyNew":
    case "hideSaved":
      if (key === "onlyNew" ? !filters.onlyNew : !filters.hideSaved) return true;
      return !isSavedJob(j, options);
    default:
      return true; // kind: server side
  }
}

export const FILTER_KEYS: (keyof JobFilters)[] = ["radiusKm", "cantons", "jobTypes", "workloadMin", "fields", "startYear", "education", "languages", "companies", "sources", "postedWithin", "remote", "salaryMin", "onlyNew", "hideSaved"];

export function applyJobFilters(jobs: EnrichedJob[], filters: JobFilters, options: FilterOptions = {}): EnrichedJob[] {
  return jobs.filter((job) => FILTER_KEYS.every((key) => passes(job, filters, key, options)));
}

/** Number of active (non-default) filters, location/kind excluded unless a radius is set. */
export function activeFilterCount(filters: JobFilters): number {
  return [
    filters.radiusKm !== undefined && filters.location.trim(), filters.cantons.length, filters.jobTypes.length,
    filters.workloadMin !== undefined || filters.workloadMax !== undefined, filters.fields.length, filters.startYear !== undefined,
    filters.education.length, filters.languages.length, filters.companies.length, filters.sources.length, filters.postedWithin,
    filters.remote, filters.salaryMin !== undefined, filters.onlyNew, filters.hideSaved,
  ].filter(Boolean).length;
}
