// Shared contract for the job / Lehrstellen search (see JOBSEARCH-PLAN.md). Pure types, no imports from React.
import type { JobSearchResult } from "../job-results.ts";

export type JobType = "lehrstelle" | "schnupperlehre" | "praktikum" | "vollzeit" | "teilzeit" | "temporaer" | "freelance" | "other";
export type PostedWithin = 1 | 3 | 7 | 14 | 30;
export type EducationLevel = "efz" | "eba" | "bm" | "hf" | "fh" | "uni" | "none";
export type JobSort = "relevance" | "distance" | "newest" | "company" | "location" | "start";

export interface JobFilters {
  kind: "job" | "apprenticeship";          // main tab (server-side)
  location: string;                         // free text place, resolved by the search API (lib/geo/places.ts)
  radiusKm?: number;                        // 0 ("Nur dieser Ort")|5|10|20|30|50, only with a place; undefined = default 10 km
  cantons: string[];                        // two-letter codes ZH, BE ... (client)
  jobTypes: JobType[];
  workloadMin?: number;                     // pensum % lower bound 10..100
  workloadMax?: number;
  fields: string[];                         // profession fields/branches (normalized ids from lib/job-filters/taxonomy.ts)
  startYear?: number;                       // e.g. 2027 (Lehrbeginn / Eintritt)
  education: EducationLevel[];
  languages: string[];                      // "de"|"fr"|"it"|"en"
  companies: string[];                      // exact company names (normalized compare)
  sources: string[];                        // "Yousty"|"jobs.ch"|"jobup.ch"
  postedWithin?: PostedWithin;              // days
  remote?: "remote" | "hybrid" | "onsite";
  salaryMin?: number;                       // CHF/year, only when listing has it
  onlyNew?: boolean;                        // not yet saved by the user
  hideSaved?: boolean;
}

export interface JobSearchState {
  query: string;
  filters: JobFilters;
  sort: JobSort;
}

export interface JobPreset { id: string; name: string; state: JobSearchState; createdAt: string }

/** Enriched listing fields (all optional; filled by providers when the source exposes them). Mirrors JobSearchResult extras. */
export interface JobMeta {
  contract?: string;        // raw text, e.g. "Festanstellung", "Lehrstelle"
  jobType?: JobType;
  workloadMin?: number;
  workloadMax?: number;
  postedAt?: string;        // ISO date
  startDate?: string;       // ISO date or year string
  canton?: string;
  education?: EducationLevel;
  language?: string;
  remote?: "remote" | "hybrid" | "onsite";
  salaryMin?: number;
  salaryMax?: number;
  field?: string;           // taxonomy id
  snippet?: string;
}

export type EnrichedJob = JobSearchResult & JobMeta;

export interface RankedJob { job: EnrichedJob; score: number; matches: { field: "title" | "company" | "location" | "snippet"; ranges: [number, number][] }[] }

export const emptyFilters = (kind: JobFilters["kind"] = "apprenticeship"): JobFilters => ({
  kind, location: "", cantons: [], jobTypes: [], fields: [], education: [], languages: [], companies: [], sources: [],
});
