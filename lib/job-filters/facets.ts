// Facet counts for the filter panel. Disjunctive: a dimension's counts ignore its own selection, so users can widen a choice.
import type { JobFilters, EnrichedJob, JobType, EducationLevel } from "./types.ts";
import { passes, FILTER_KEYS, companyKey } from "./filter.ts";
import type { FilterOptions } from "./filter.ts";
import { detectJobTypes, enrichJob, startYearOf } from "./taxonomy.ts";

export interface Facets {
  cantons: Record<string, number>;
  jobTypes: Partial<Record<JobType, number>>;
  fields: Record<string, number>;
  education: Partial<Record<EducationLevel, number>>;
  languages: Record<string, number>;
  sources: Record<string, number>;
  startYears: Record<string, number>;
  remote: Record<string, number>;
  postedWithin: Record<string, number>;
  workload: Record<string, number>;
  /** Top companies (display name -> count), at most 25. */
  companies: Record<string, number>;
  total: number;
}

const bump = (map: Record<string, number>, key: string | undefined) => { if (key) map[key] = (map[key] ?? 0) + 1; };
type Dim = "cantons" | "jobTypes" | "fields" | "education" | "languages" | "sources" | "startYear" | "remote" | "postedWithin" | "workload" | "companies";
const KEY_OF: Record<Dim, keyof JobFilters> = { cantons: "cantons", jobTypes: "jobTypes", fields: "fields", education: "education", languages: "languages", sources: "sources", startYear: "startYear", remote: "remote", postedWithin: "postedWithin", workload: "workloadMin", companies: "companies" };

/** Pool of listings that pass every filter except the one for `dim`. */
function pool(jobs: EnrichedJob[], filters: JobFilters, dim: Dim, options: FilterOptions): EnrichedJob[] {
  const skip = KEY_OF[dim];
  return jobs.filter((job) => FILTER_KEYS.every((key) => key === skip || passes(job, filters, key, options)));
}

export function computeFacets(jobs: EnrichedJob[], filters: JobFilters, options: FilterOptions = {}): Facets {
  const now = options.now ?? Date.now();
  const facets: Facets = { cantons: {}, jobTypes: {}, fields: {}, education: {}, languages: {}, sources: {}, startYears: {}, remote: {}, postedWithin: {}, workload: {}, companies: {}, total: 0 };
  facets.total = jobs.filter((job) => FILTER_KEYS.every((key) => passes(job, filters, key, { ...options, now }))).length;
  for (const raw of pool(jobs, filters, "cantons", options)) bump(facets.cantons, enrichJob(raw).canton);
  for (const raw of pool(jobs, filters, "jobTypes", options)) for (const t of detectJobTypes(enrichJob(raw))) bump(facets.jobTypes as Record<string, number>, t);
  for (const raw of pool(jobs, filters, "fields", options)) bump(facets.fields, enrichJob(raw).field);
  for (const raw of pool(jobs, filters, "education", options)) bump(facets.education as Record<string, number>, enrichJob(raw).education);
  for (const raw of pool(jobs, filters, "languages", options)) bump(facets.languages, enrichJob(raw).language);
  for (const raw of pool(jobs, filters, "sources", options)) {
    const j = enrichJob(raw);
    for (const name of new Set([j.source, ...(j.sources ?? []).map((s) => s.name)])) bump(facets.sources, name);
  }
  for (const raw of pool(jobs, filters, "startYear", options)) { const y = startYearOf(enrichJob(raw)); if (y) bump(facets.startYears, String(y)); }
  for (const raw of pool(jobs, filters, "remote", options)) bump(facets.remote, enrichJob(raw).remote);
  for (const raw of pool(jobs, filters, "postedWithin", options)) {
    const t = enrichJob(raw).postedAt ? Date.parse(enrichJob(raw).postedAt!) : NaN;
    if (Number.isNaN(t)) continue;
    for (const days of [1, 3, 7, 14, 30]) if (now - t <= days * 86_400_000 + 43_200_000) bump(facets.postedWithin, String(days));
  }
  for (const raw of pool(jobs, filters, "workload", options)) {
    const j = enrichJob(raw);
    const hi = j.workloadMax ?? j.workloadMin;
    if (hi === undefined) continue;
    bump(facets.workload, hi >= 100 ? "100" : hi >= 80 ? "80-99" : hi >= 50 ? "50-79" : "10-49");
  }
  const names: Record<string, { name: string; count: number }> = {};
  for (const raw of pool(jobs, filters, "companies", options)) {
    const company = enrichJob(raw).company?.trim();
    if (!company) continue;
    const key = companyKey(company);
    names[key] = names[key] ? { name: names[key].name, count: names[key].count + 1 } : { name: company, count: 1 };
  }
  Object.values(names).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "de")).slice(0, 25).forEach(({ name, count }) => { facets.companies[name] = count; });
  return facets;
}
