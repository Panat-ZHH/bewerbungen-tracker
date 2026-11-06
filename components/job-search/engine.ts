// Adapter between the job-search UI and the filter engine.
// The real engine lives in lib/job-filters (part "core"). Until it is merged into this branch this file provides a small,
// self-contained fallback with the same shape. After `git merge jobs-core`, swap the bodies for re-exports from lib/job-filters.
import type { EducationLevel, EnrichedJob, JobFilters, JobPreset, JobSearchState, JobSort, JobType, PostedWithin, RankedJob } from "../../lib/job-filters/types.ts";
import { emptyFilters } from "../../lib/job-filters/types.ts";

export { emptyFilters };
export type { EnrichedJob, JobFilters, JobPreset, JobSearchState, JobSort, JobType, RankedJob };

export const JOB_TYPE_LABELS: Record<JobType, string> = { lehrstelle: "Lehrstelle", praktikum: "Praktikum", vollzeit: "Vollzeit", teilzeit: "Teilzeit", temporaer: "Temporär", freelance: "Freelance", other: "Andere" };
export const EDUCATION_LABELS: Record<EducationLevel, string> = { efz: "EFZ", eba: "EBA", bm: "Berufsmaturität", hf: "Höhere Fachschule", fh: "Fachhochschule", uni: "Universität", none: "Ohne Abschluss" };
export const FIELD_LABELS: Record<string, string> = { it: "Informatik", kaufmaennisch: "Kaufmännisch", detailhandel: "Detailhandel", gesundheit: "Gesundheit & Pflege", technik: "Technik & Industrie", bau: "Bau & Handwerk", gastro: "Gastro & Hotellerie", verkauf: "Verkauf & Marketing", bildung: "Soziales & Bildung", logistik: "Logistik & Transport", natur: "Natur & Umwelt", gestaltung: "Gestaltung & Medien" };
export const LANGUAGE_LABELS: Record<string, string> = { de: "Deutsch", fr: "Französisch", it: "Italienisch", en: "Englisch" };
export const POSTED_OPTIONS: { value: PostedWithin; label: string }[] = [{ value: 1, label: "Heute" }, { value: 3, label: "3 Tage" }, { value: 7, label: "7 Tage" }, { value: 14, label: "14 Tage" }, { value: 30, label: "30 Tage" }];
export const RADIUS_OPTIONS = [5, 10, 20, 30, 50, 100];
export const SORT_LABELS: Record<JobSort, string> = { relevance: "Relevanz", newest: "Neueste zuerst", company: "Firma A–Z", location: "Ort A–Z", start: "Eintritt" };
export const REMOTE_LABELS = { remote: "Remote", hybrid: "Hybrid", onsite: "Vor Ort" } as const;
export const CANTONS = ["AG", "AI", "AR", "BE", "BL", "BS", "FR", "GE", "GL", "GR", "JU", "LU", "NE", "NW", "OW", "SG", "SH", "SO", "SZ", "TG", "TI", "UR", "VD", "VS", "ZG", "ZH"];
export const SOURCE_NAMES = ["Yousty", "jobs.ch", "jobup.ch"];

/** Fold to lowercase ASCII without changing string length (so match ranges map back to the original text). */
export function fold(value: string): string {
  let out = "";
  for (const char of value) {
    const base = char === "ß" ? "s" : char.normalize("NFD")[0] ?? char;
    out += base.toLowerCase().length === 1 ? base.toLowerCase() : char;
  }
  return out;
}
const normalizeCompare = (value: string) => fold(value).replace(/[^a-z0-9]+/g, " ").trim();

const SYNONYMS: [string, string[]][] = [
  ["lehrstelle", ["lehre", "efz", "eba", "ausbildung", "stift"]],
  ["praktikum", ["stage", "volontariat"]],
  ["teilzeit", ["teilzeitpensum"]],
  ["informatiker", ["informatik", "applikationsentwickler", "fachmann information"]],
  ["kaufmann", ["kauffrau", "kaufmaennisch", "büroassistent"]],
  ["detailhandel", ["verkauf", "detailhandelsfachmann"]],
  ["fage", ["fachmann gesundheit", "fachfrau gesundheit"]],
  ["polymechaniker", ["mechaniker", "polymechanikerin"]],
];
export function synonymHints(query: string): string[] {
  const words = normalizeCompare(query).split(" ").filter(Boolean);
  const out = new Set<string>();
  for (const [key, list] of SYNONYMS) {
    const group = [key, ...list].map(normalizeCompare);
    if (words.some((word) => group.some((term) => term === word || (word.length > 3 && term.startsWith(word))))) group.forEach((term) => { if (!words.includes(term)) out.add(term); });
  }
  return [...out].slice(0, 5);
}
export function suggestQueries(prefix: string, limit = 6): string[] {
  const p = normalizeCompare(prefix);
  if (p.length < 2) return [];
  const pool = ["Informatiker/in EFZ", "Kaufmann/-frau EFZ", "Detailhandelsfachmann/-frau", "Fachmann/-frau Gesundheit", "Polymechaniker/in", "Elektroinstallateur/in", "Logistiker/in", "Koch/Köchin", "Maurer/in", "Zeichner/in", "Mediamatiker/in", "Praktikum Marketing", "Sachbearbeiter/in", "Projektleiter/in", "Software Engineer"];
  return pool.filter((item) => normalizeCompare(item).includes(p)).slice(0, limit);
}

const day = 86_400_000;
function postedDays(job: EnrichedJob, now: number): number | undefined {
  if (!job.postedAt) return undefined;
  const time = Date.parse(job.postedAt);
  return Number.isNaN(time) ? undefined : Math.max(0, Math.floor((now - time) / day));
}
export function jobCanton(job: EnrichedJob): string | undefined {
  if (job.canton) return job.canton.toUpperCase();
  const match = job.location?.match(/\b(AG|AI|AR|BE|BL|BS|FR|GE|GL|GR|JU|LU|NE|NW|OW|SG|SH|SO|SZ|TG|TI|UR|VD|VS|ZG|ZH)\b/);
  return match?.[1];
}

/** Missing data never excludes a listing. */
export function applyFilters(jobs: EnrichedJob[], f: JobFilters, savedUrls: Set<string>, now = Date.now()): EnrichedJob[] {
  const companies = new Set(f.companies.map(normalizeCompare));
  return jobs.filter((job) => {
    if (f.cantons.length) { const c = jobCanton(job); if (c && !f.cantons.includes(c)) return false; }
    if (f.jobTypes.length && job.jobType && !f.jobTypes.includes(job.jobType)) return false;
    if (f.workloadMin !== undefined && job.workloadMax !== undefined && job.workloadMax < f.workloadMin) return false;
    if (f.workloadMax !== undefined && job.workloadMin !== undefined && job.workloadMin > f.workloadMax) return false;
    if (f.fields.length && job.field && !f.fields.includes(job.field)) return false;
    if (f.startYear !== undefined) {
      const years = [...(job.years ?? []), job.startDate?.slice(0, 4) ?? ""].filter(Boolean);
      if (years.length && !years.includes(String(f.startYear))) return false;
    }
    if (f.education.length && job.education && !f.education.includes(job.education)) return false;
    if (f.languages.length && job.language && !f.languages.includes(job.language)) return false;
    if (companies.size && !(job.company && companies.has(normalizeCompare(job.company)))) return false;
    if (f.sources.length && !(job.sources?.length ? job.sources.map((s) => s.name) : [job.source]).some((n) => f.sources.includes(n))) return false;
    if (f.postedWithin) { const d = postedDays(job, now); if (d !== undefined && d > f.postedWithin) return false; }
    if (f.remote && job.remote && job.remote !== f.remote) return false;
    if (f.salaryMin !== undefined && (job.salaryMax ?? job.salaryMin) !== undefined && (job.salaryMax ?? job.salaryMin)! < f.salaryMin) return false;
    if ((f.hideSaved || f.onlyNew) && (savedUrls.has(job.url) || job.sources?.some((s) => savedUrls.has(s.url)))) return false;
    return true;
  });
}

const FIELD_WEIGHT = { title: 10, company: 5, location: 3, snippet: 1 } as const;
function ranges(text: string, tokens: string[]): [number, number][] {
  const hay = fold(text);
  const out: [number, number][] = [];
  for (const token of tokens) {
    let from = 0;
    for (;;) { const at = hay.indexOf(token, from); if (at < 0) break; out.push([at, at + token.length]); from = at + token.length; }
  }
  out.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const r of out) { const last = merged[merged.length - 1]; if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]); else merged.push([...r]); }
  return merged;
}
export function rankJobs(jobs: EnrichedJob[], query: string, now = Date.now()): RankedJob[] {
  const tokens = fold(query).split(/[^a-z0-9]+/).filter((t) => t.length > 1);
  return jobs.map((job, index) => {
    let score = 0;
    const matches: RankedJob["matches"] = [];
    for (const field of ["title", "company", "location", "snippet"] as const) {
      const text = job[field];
      if (!text || !tokens.length) continue;
      const r = ranges(text, tokens);
      if (r.length) { matches.push({ field, ranges: r }); score += FIELD_WEIGHT[field] * r.length + (r[0][0] === 0 ? FIELD_WEIGHT[field] : 0); }
    }
    const d = postedDays(job, now);
    if (d !== undefined) score += Math.max(0, 2 - d / 15);
    return { job, score: score - index * 1e-6, matches };
  });
}

export function sortJobs(items: RankedJob[], sort: JobSort): RankedJob[] {
  const copy = [...items];
  const text = (a?: string, b?: string) => (a ?? "￿").localeCompare(b ?? "￿", "de");
  if (sort === "relevance") return copy.sort((a, b) => b.score - a.score);
  if (sort === "newest") return copy.sort((a, b) => (Date.parse(b.job.postedAt ?? "") || 0) - (Date.parse(a.job.postedAt ?? "") || 0));
  if (sort === "company") return copy.sort((a, b) => text(a.job.company, b.job.company));
  if (sort === "location") return copy.sort((a, b) => text(a.job.location, b.job.location));
  return copy.sort((a, b) => text(a.job.startDate ?? a.job.years?.[0], b.job.startDate ?? b.job.years?.[0]));
}

export type Facets = { jobTypes: Record<string, number>; cantons: Record<string, number>; fields: Record<string, number>; sources: Record<string, number>; education: Record<string, number> };
export function computeFacets(jobs: EnrichedJob[]): Facets {
  const facets: Facets = { jobTypes: {}, cantons: {}, fields: {}, sources: {}, education: {} };
  const bump = (bucket: Record<string, number>, key?: string) => { if (key) bucket[key] = (bucket[key] ?? 0) + 1; };
  for (const job of jobs) {
    bump(facets.jobTypes, job.jobType); bump(facets.cantons, jobCanton(job)); bump(facets.fields, job.field); bump(facets.education, job.education);
    new Set(job.sources?.length ? job.sources.map((s) => s.name) : [job.source]).forEach((n) => bump(facets.sources, n));
  }
  return facets;
}

export function companyOptions(jobs: EnrichedJob[], limit = 40): string[] {
  const counts = new Map<string, number>();
  for (const job of jobs) if (job.company) counts.set(job.company, (counts.get(job.company) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "de")).slice(0, limit).map(([name]) => name);
}

export function activeFilterCount(f: JobFilters): number {
  return (f.radiusKm ? 1 : 0) + f.cantons.length + f.jobTypes.length + (f.workloadMin !== undefined || f.workloadMax !== undefined ? 1 : 0) + f.fields.length + (f.startYear ? 1 : 0) + f.education.length + f.languages.length + f.companies.length + f.sources.length + (f.postedWithin ? 1 : 0) + (f.remote ? 1 : 0) + (f.salaryMin ? 1 : 0) + (f.hideSaved ? 1 : 0);
}

// ---- URL <-> state ----
const list = <T extends string>(value: string | null, allowed?: readonly string[]): T[] => (value ? value.split(",").map((v) => v.trim()).filter((v) => v && (!allowed || allowed.includes(v))) : []) as T[];
const int = (value: string | null, min: number, max: number): number | undefined => { const n = Number(value); return value && Number.isInteger(n) && n >= min && n <= max ? n : undefined; };
export function stateToParams(state: JobSearchState): URLSearchParams {
  const p = new URLSearchParams();
  const f = state.filters;
  if (state.query) p.set("q", state.query);
  if (f.kind !== "apprenticeship") p.set("k", f.kind);
  if (f.location) p.set("l", f.location);
  if (f.radiusKm) p.set("r", String(f.radiusKm));
  if (f.cantons.length) p.set("c", f.cantons.join(","));
  if (f.jobTypes.length) p.set("t", f.jobTypes.join(","));
  if (f.workloadMin !== undefined) p.set("wmin", String(f.workloadMin));
  if (f.workloadMax !== undefined) p.set("wmax", String(f.workloadMax));
  if (f.fields.length) p.set("f", f.fields.join(","));
  if (f.startYear) p.set("y", String(f.startYear));
  if (f.education.length) p.set("e", f.education.join(","));
  if (f.languages.length) p.set("lg", f.languages.join(","));
  if (f.companies.length) p.set("co", f.companies.join("|"));
  if (f.sources.length) p.set("s", f.sources.join(","));
  if (f.postedWithin) p.set("p", String(f.postedWithin));
  if (f.remote) p.set("rm", f.remote);
  if (f.salaryMin) p.set("sal", String(f.salaryMin));
  if (f.hideSaved) p.set("hs", "1");
  if (state.sort !== "relevance") p.set("o", state.sort);
  return p;
}
export function paramsToState(p: URLSearchParams): JobSearchState {
  const kind = p.get("k") === "job" ? "job" : "apprenticeship";
  const f = emptyFilters(kind);
  f.location = (p.get("l") ?? "").slice(0, 80);
  const radius = int(p.get("r"), 1, 500); if (radius && RADIUS_OPTIONS.includes(radius)) f.radiusKm = radius;
  f.cantons = list(p.get("c"), CANTONS);
  f.jobTypes = list<JobType>(p.get("t"), Object.keys(JOB_TYPE_LABELS));
  f.workloadMin = int(p.get("wmin"), 10, 100); f.workloadMax = int(p.get("wmax"), 10, 100);
  f.fields = list(p.get("f"), Object.keys(FIELD_LABELS));
  f.startYear = int(p.get("y"), 2020, 2100);
  f.education = list<EducationLevel>(p.get("e"), Object.keys(EDUCATION_LABELS));
  f.languages = list(p.get("lg"), Object.keys(LANGUAGE_LABELS));
  f.companies = (p.get("co") ?? "").split("|").map((v) => v.trim()).filter(Boolean).slice(0, 10);
  f.sources = list(p.get("s"), SOURCE_NAMES);
  const posted = int(p.get("p"), 1, 30); if (posted && [1, 3, 7, 14, 30].includes(posted)) f.postedWithin = posted as PostedWithin;
  const rm = p.get("rm"); if (rm === "remote" || rm === "hybrid" || rm === "onsite") f.remote = rm;
  f.salaryMin = int(p.get("sal"), 1, 1_000_000);
  if (p.get("hs") === "1") f.hideSaved = true;
  const sort = p.get("o") as JobSort | null;
  return { query: (p.get("q") ?? "").slice(0, 80), filters: f, sort: sort && sort in SORT_LABELS ? sort : "relevance" };
}

// ---- storage (SSR safe) ----
const RECENT_KEY = "wendapply.jobsearch.recent";
const PRESET_KEY = "wendapply.jobsearch.presets";
function read<T>(key: string): T[] {
  if (typeof window === "undefined") return [];
  try { const v = JSON.parse(window.localStorage.getItem(key) ?? "[]"); return Array.isArray(v) ? v : []; } catch { return []; }
}
function write(key: string, value: unknown) { try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage full or blocked */ } }
export const loadRecent = (): string[] => read<unknown>(RECENT_KEY).filter((v): v is string => typeof v === "string").slice(0, 8);
export function addRecent(query: string): string[] {
  const q = query.trim();
  if (!q) return loadRecent();
  const next = [q, ...loadRecent().filter((v) => v.toLowerCase() !== q.toLowerCase())].slice(0, 8);
  write(RECENT_KEY, next);
  return next;
}
export function clearRecent() { write(RECENT_KEY, []); }
export const loadPresets = (): JobPreset[] => read<JobPreset>(PRESET_KEY).filter((p) => p && typeof p.id === "string" && typeof p.name === "string" && p.state?.filters);
export function savePreset(name: string, state: JobSearchState): JobPreset[] {
  const preset: JobPreset = { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, name: name.trim().slice(0, 40) || "Suche", state, createdAt: new Date().toISOString() };
  const next = [preset, ...loadPresets()].slice(0, 20);
  write(PRESET_KEY, next);
  return next;
}
export function deletePreset(id: string): JobPreset[] {
  const next = loadPresets().filter((p) => p.id !== id);
  write(PRESET_KEY, next);
  return next;
}
