// Radius options, URL parameters, the browser-side radius filter and the distance sort.
import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_RADIUS_KM, RADIUS_OPTIONS, effectiveRadiusKm, formatDistance, radiusLabel } from "../lib/job-filters/taxonomy.ts";
import { paramsToState, stateToParams } from "../lib/job-filters/url.ts";
import { activeFilterCount, applyJobFilters } from "../lib/job-filters/filter.ts";
import { rankJobs } from "../lib/job-filters/rank.ts";
import { SORT_LABELS, SORT_OPTIONS, sortJobs } from "../lib/job-filters/sort.ts";
import { emptyFilters } from "../lib/job-filters/types.ts";
import { normalizeRadius } from "../lib/job-search.ts";
import * as engine from "../components/job-search/engine.ts";

const job = (company, extra = {}) => ({ title: "Informatiker/in EFZ", company, url: `https://example.invalid/${encodeURIComponent(company)}`, source: "Yousty", ...extra });
// listings as the search API delivers them for a search around Winterthur
const listings = [
  job("Zürich AG", { location: "Zürich", distanceKm: 19.9 }), job("Seuzach AG", { location: "Seuzach", distanceKm: 3.9 }),
  job("Winterthur AG", { location: "Winterthur", distanceKm: 0, inPlace: true }), job("Töss AG", { location: "8406 Winterthur", distanceKm: 2.6, inPlace: true }),
  job("Effretikon AG", { location: "Effretikon", distanceKm: 8.6 }), job("Frauenfeld AG", { location: "Frauenfeld", distanceKm: 14.3 }),
];
const filter = (patch) => applyJobFilters(listings, { ...emptyFilters(), ...patch }).map((j) => j.company);

test("radius options: 'Nur dieser Ort', 5, 10 (default), 20, 30, 50 km – no 'ganze Schweiz' entry", () => {
  assert.deepEqual([...RADIUS_OPTIONS], [0, 5, 10, 20, 30, 50]);
  assert.equal(DEFAULT_RADIUS_KM, 10);
  assert.deepEqual(RADIUS_OPTIONS.map(radiusLabel), ["Nur dieser Ort", "5 km", "10 km", "20 km", "30 km", "50 km"]);
  assert.equal(effectiveRadiusKm({}), 10);
  assert.equal(effectiveRadiusKm({ radiusKm: 0 }), 0);
  assert.equal(effectiveRadiusKm({ radiusKm: 30 }), 30);
  assert.deepEqual([engine.RADIUS_OPTIONS, engine.DEFAULT_RADIUS_KM, engine.radiusLabel(0)], [RADIUS_OPTIONS, 10, "Nur dieser Ort"]);
  assert.deepEqual([normalizeRadius(undefined), normalizeRadius(0), normalizeRadius(20), normalizeRadius(100), normalizeRadius(7)], [10, 0, 20, 50, 10]);
});

test("URL round trip of place and radius; old links keep working", () => {
  for (const radiusKm of RADIUS_OPTIONS) {
    const state = { query: "Informatiker", sort: "distance", filters: { ...emptyFilters(), location: "Winterthur", radiusKm } };
    const params = stateToParams(state);
    assert.equal(params.get("r"), String(radiusKm));
    assert.equal(params.get("l"), "Winterthur");
    assert.deepEqual(paramsToState(params.toString()), state);
  }
  // "Nur dieser Ort" has its own URL-safe value
  assert.equal(paramsToState("q=Informatiker&k=a&l=Uster&r=0").filters.radiusKm, 0);
  // the URL of the bug report: a place without a radius means the default (10 km), nothing is written into the state
  const reported = paramsToState("q=Informatiker&k=a&l=Winterthur");
  assert.deepEqual([reported.filters.location, reported.filters.radiusKm, effectiveRadiusKm(reported.filters)], ["Winterthur", undefined, 10]);
  assert.equal(stateToParams(reported).has("r"), false);
  // removed option 100 km -> largest radius; nonsense is dropped (= default)
  assert.equal(paramsToState("q=x&l=Bern&r=100").filters.radiusKm, 50);
  for (const bad of ["7", "-5", "abc", "1000", "0.5"]) assert.equal(paramsToState(`q=x&l=Bern&r=${bad}`).filters.radiusKm, undefined, bad);
  assert.ok(SORT_OPTIONS.includes("distance") && SORT_LABELS.distance);
  assert.equal(paramsToState("q=x&so=distance").sort, "distance");
});

test("browser-side radius filter applies the API's distances: narrowing needs no new search", () => {
  assert.deepEqual(filter({ location: "Winterthur" }), ["Seuzach AG", "Winterthur AG", "Töss AG", "Effretikon AG"], "default 10 km");
  assert.deepEqual(filter({ location: "Winterthur", radiusKm: 10 }), ["Seuzach AG", "Winterthur AG", "Töss AG", "Effretikon AG"]);
  assert.deepEqual(filter({ location: "Winterthur", radiusKm: 5 }), ["Seuzach AG", "Winterthur AG", "Töss AG"]);
  assert.deepEqual(filter({ location: "Winterthur", radiusKm: 0 }), ["Winterthur AG", "Töss AG"], "Nur dieser Ort keeps the whole municipality");
  assert.deepEqual(filter({ location: "Winterthur", radiusKm: 20 }), listings.map((j) => j.company));
  // without a place nothing is filtered by distance, whatever the radius says
  assert.deepEqual(filter({ location: "", radiusKm: 5 }), listings.map((j) => j.company));
  assert.deepEqual(filter({ location: "   ", radiusKm: 0 }), listings.map((j) => j.company));
  // a listing without a distance (loaded before the place was set) is not thrown away by the browser; the API decides
  assert.deepEqual(applyJobFilters([job("Alt AG", { location: "Irgendwo" })], { ...emptyFilters(), location: "Winterthur", radiusKm: 5 }).length, 1);
  assert.deepEqual(applyJobFilters([job("Alt AG", { location: "Irgendwo" })], { ...emptyFilters(), location: "Winterthur", radiusKm: 5 }, { strict: true }).length, 0);
  assert.equal(activeFilterCount({ ...emptyFilters(), location: "Winterthur", radiusKm: 0 }), 1);
  assert.equal(activeFilterCount({ ...emptyFilters(), location: "", radiusKm: 0 }), 0);
});

test("sort 'Nächste zuerst': by distance, same distance keeps relevance, listings without distance last", () => {
  const ranked = rankJobs([...listings, job("Ohne Distanz AG")], { query: "Informatiker" }, Date.now());
  const sorted = sortJobs(ranked, "distance").map((item) => item.job.company);
  assert.deepEqual(sorted, ["Winterthur AG", "Töss AG", "Seuzach AG", "Effretikon AG", "Frauenfeld AG", "Zürich AG", "Ohne Distanz AG"]);
  const tie = rankJobs([job("B AG", { title: "Kaufmann EFZ", distanceKm: 3 }), job("A AG", { title: "Informatiker EFZ", distanceKm: 3 }), job("C AG", { title: "Informatiker EFZ", distanceKm: 1 })], { query: "" }, Date.now());
  assert.deepEqual(sortJobs(tie, "distance").map((item) => item.job.company), ["C AG", "B AG", "A AG"]);
  // the input is not mutated and other sorts are unchanged
  assert.deepEqual(sortJobs(ranked, "company").map((item) => item.job.company)[0], "Effretikon AG");
  assert.equal(ranked[0].job.company, "Zürich AG");
});

test("distance text on the card", () => {
  assert.deepEqual([formatDistance(12.4), formatDistance(11.6), formatDistance(1), formatDistance(0.4), formatDistance(0)], ["12 km", "12 km", "1 km", "< 1 km", "< 1 km"]);
  assert.deepEqual([formatDistance(undefined), formatDistance(Number.NaN), formatDistance(-1)], [undefined, undefined, undefined]);
  assert.equal(engine.formatDistance(12), "12 km");
});
