// URL <-> JobSearchState with short keys. Invalid values are dropped silently; defaults are omitted.
import type { EducationLevel, JobFilters, JobSearchState, JobSort, JobType, PostedWithin } from "./types.ts";
import { emptyFilters } from "./types.ts";
import { CANTON_CODES } from "../geo/cantons.ts";
import { FIELD_IDS, EDUCATION_LEVELS, JOB_TYPES, LANGUAGES, POSTED_WITHIN_OPTIONS, RADIUS_OPTIONS } from "./taxonomy.ts";
import { SORT_OPTIONS } from "./sort.ts";

export const SOURCE_NAMES = ["Yousty", "jobs.ch", "jobup.ch"];
const MAX_LEN = 200;

const list = (v: string | null) => (v ? v.split(",").map((x) => x.trim()).filter(Boolean) : []);
const pick = <T extends string>(v: string | null, allowed: readonly T[], fold = false): T[] => {
  const out = list(v).map((x) => (fold ? x.toLowerCase() : x)).filter((x): x is T => (allowed as readonly string[]).includes(x));
  return [...new Set(out)];
};
const int = (v: string | null, min: number, max: number): number | undefined => {
  if (v === null || !/^\d{1,6}$/.test(v)) return undefined;
  const n = Number(v);
  return n >= min && n <= max ? n : undefined;
};

export function stateToParams(state: JobSearchState): URLSearchParams {
  const p = new URLSearchParams();
  const f = state.filters;
  if (state.query.trim()) p.set("q", state.query.trim().slice(0, MAX_LEN));
  p.set("k", f.kind === "job" ? "j" : "a");
  if (f.location.trim()) p.set("l", f.location.trim().slice(0, MAX_LEN));
  if (f.radiusKm !== undefined) p.set("r", String(f.radiusKm));
  if (f.cantons.length) p.set("c", f.cantons.join(","));
  if (f.jobTypes.length) p.set("t", f.jobTypes.join(","));
  if (f.workloadMin !== undefined) p.set("wn", String(f.workloadMin));
  if (f.workloadMax !== undefined) p.set("wx", String(f.workloadMax));
  if (f.fields.length) p.set("f", f.fields.join(","));
  if (f.startYear !== undefined) p.set("y", String(f.startYear));
  if (f.education.length) p.set("e", f.education.join(","));
  if (f.languages.length) p.set("g", f.languages.join(","));
  if (f.companies.length) p.set("co", f.companies.map((c) => c.replace(/\|/g, " ")).join("|"));
  if (f.sources.length) p.set("s", f.sources.join(","));
  if (f.postedWithin) p.set("p", String(f.postedWithin));
  if (f.remote) p.set("rm", f.remote);
  if (f.salaryMin !== undefined) p.set("sm", String(f.salaryMin));
  if (f.onlyNew) p.set("on", "1");
  if (f.hideSaved) p.set("hs", "1");
  if (state.sort !== "relevance") p.set("so", state.sort);
  return p;
}

export function paramsToState(input: URLSearchParams | string | Record<string, string | string[] | undefined>, defaultKind: JobFilters["kind"] = "apprenticeship"): JobSearchState {
  let p: URLSearchParams;
  if (input instanceof URLSearchParams) p = input;
  else if (typeof input === "string") p = new URLSearchParams(input.replace(/^\?/, ""));
  else {
    p = new URLSearchParams();
    for (const [k, v] of Object.entries(input)) if (v !== undefined) p.set(k, Array.isArray(v) ? v[0] ?? "" : v);
  }
  const kind = p.get("k") === "j" ? "job" : p.get("k") === "a" ? "apprenticeship" : defaultKind;
  const f = emptyFilters(kind);
  f.location = (p.get("l") ?? "").trim().slice(0, MAX_LEN);
  // r=0 is "Nur dieser Ort". Old links: r=100 (removed option) becomes the largest radius, no r with a place means the default of 10 km.
  const radius = int(p.get("r"), 0, 1000);
  if (radius !== undefined && (RADIUS_OPTIONS as readonly number[]).includes(radius)) f.radiusKm = radius;
  else if (radius === 100) f.radiusKm = 50;
  f.cantons = pick(p.get("c")?.toUpperCase() ?? null, CANTON_CODES);
  f.jobTypes = pick<JobType>(p.get("t"), JOB_TYPES);
  f.workloadMin = int(p.get("wn"), 10, 100);
  f.workloadMax = int(p.get("wx"), 10, 100);
  if (f.workloadMin !== undefined && f.workloadMax !== undefined && f.workloadMin > f.workloadMax) { f.workloadMin = undefined; f.workloadMax = undefined; }
  f.fields = pick(p.get("f"), FIELD_IDS);
  f.startYear = int(p.get("y"), 2020, 2040);
  f.education = pick<EducationLevel>(p.get("e"), EDUCATION_LEVELS);
  f.languages = pick(p.get("g"), LANGUAGES, true);
  f.companies = (p.get("co") ?? "").split("|").map((x) => x.trim().slice(0, MAX_LEN)).filter(Boolean).slice(0, 20);
  f.sources = pick(p.get("s"), SOURCE_NAMES);
  const posted = int(p.get("p"), 1, 30);
  if (posted !== undefined && (POSTED_WITHIN_OPTIONS as number[]).includes(posted)) f.postedWithin = posted as PostedWithin;
  const remote = p.get("rm");
  if (remote === "remote" || remote === "hybrid" || remote === "onsite") f.remote = remote;
  f.salaryMin = int(p.get("sm"), 1, 10_000_000);
  if (p.get("on") === "1") f.onlyNew = true;
  if (p.get("hs") === "1") f.hideSaved = true;
  const sort = p.get("so") as JobSort | null;
  // drop undefined keys so deep-equality with hand-built filters works
  for (const key of Object.keys(f) as (keyof JobFilters)[]) if (f[key] === undefined) delete f[key];
  return { query: (p.get("q") ?? "").trim().slice(0, MAX_LEN), filters: f, sort: sort && SORT_OPTIONS.includes(sort) ? sort : "relevance" };
}
