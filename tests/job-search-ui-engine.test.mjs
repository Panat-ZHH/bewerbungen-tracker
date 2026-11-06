import test from "node:test";
import assert from "node:assert/strict";
import { applyFilters, emptyFilters, paramsToState, rankJobs, sortJobs, stateToParams, computeFacets, activeFilterCount } from "../components/job-search/engine.ts";

const jobs = [
  { title: "Informatiker/in EFZ", company: "Müller AG", location: "8001 Zürich", url: "https://a", source: "Yousty", jobType: "lehrstelle", canton: "ZH" },
  { title: "Kaufmann EFZ", company: "Bank BE", location: "Bern", url: "https://b", source: "jobs.ch", jobType: "lehrstelle" },
  { title: "Software Engineer", company: "Acme", location: "Basel BS", url: "https://c", source: "jobup.ch", workloadMin: 60, workloadMax: 80 },
];

test("filters keep listings with missing data and drop mismatches", () => {
  const f = { ...emptyFilters("job"), cantons: ["ZH"] };
  // core resolves "Bern" -> BE and "Basel BS" -> BS, so only the Zürich listing stays
  assert.deepEqual(applyFilters(jobs, f, new Set()).map((j) => j.url), ["https://a"]);
  assert.deepEqual(applyFilters([{ title: "X", url: "https://x", source: "jobs.ch" }], f, new Set()).length, 1); // missing data is kept
  const pensum = { ...emptyFilters("job"), workloadMin: 90 };
  assert.equal(applyFilters(jobs, pensum, new Set()).some((j) => j.url === "https://c"), false);
  assert.equal(applyFilters(jobs, { ...emptyFilters(), hideSaved: true }, new Set(["https://a"])).length, 2);
});

test("ranking folds umlauts and returns highlight ranges", () => {
  const ranked = rankJobs(jobs, "muller");
  assert.equal(sortJobs(ranked, "relevance")[0].job.url, "https://a");
  assert.deepEqual(ranked[0].matches.find((m) => m.field === "company").ranges, [[0, 6]]);
});

test("url state round-trips and drops invalid values", () => {
  const state = { query: "Informatiker", sort: "newest", filters: { ...emptyFilters("job"), location: "Zürich", radiusKm: 20, cantons: ["ZH", "BE"], jobTypes: ["teilzeit"], postedWithin: 7, hideSaved: true } };
  assert.deepEqual(paramsToState(stateToParams(state)), state);
  const bad = paramsToState(new URLSearchParams("c=XX,ZH&t=foo&r=7&p=9&o=zzz"));
  assert.deepEqual(bad.filters.cantons, ["ZH"]);
  assert.deepEqual(bad.filters.jobTypes, []);
  assert.equal(bad.filters.radiusKm, undefined);
  assert.equal(bad.sort, "relevance");
});

test("facets and filter count", () => {
  assert.equal(computeFacets(jobs, emptyFilters()).jobTypes.lehrstelle, 2);
  assert.equal(activeFilterCount({ ...emptyFilters(), cantons: ["ZH", "BE"], remote: "hybrid" }), 2); // counts active filter groups
});
