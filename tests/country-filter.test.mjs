// "Schweiz / Alle" filter of the job search: country detection (search API), filter, facets, URL, presets.
import assert from "node:assert/strict";
import { test } from "node:test";
import { countryInText, detectListingCountry, listingCountry, countryLabel } from "../lib/geo/country.ts";
import { applyJobFilters, activeFilterCount } from "../lib/job-filters/filter.ts";
import { computeFacets } from "../lib/job-filters/facets.ts";
import { paramsToState, stateToParams } from "../lib/job-filters/url.ts";
import { loadPresets, savePreset } from "../lib/job-filters/storage.ts";
import { emptyFilters } from "../lib/job-filters/types.ts";
import { fixture, installWorld, loadAll, YOUSTY } from "./helpers/ort-suche-world.mjs";

let instance = 0;
const load = () => import(`../lib/job-search.ts?country-${++instance}`);
const job = (title, extra = {}) => ({ title, url: `https://x.ch/${encodeURIComponent(title)}`, source: "jobs.ch", ...extra });
const memory = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };

test("country in a place text: country names, foreign address prefixes, Swiss-wide wording", () => {
  assert.equal(countryInText("Konstanz, Deutschland"), "DE");
  assert.equal(countryInText("D-78462 Konstanz"), "DE");
  assert.equal(countryInText("FL-9490 Vaduz"), "LI");
  assert.equal(countryInText("A-6800 Feldkirch"), "AT");
  assert.equal(countryInText("Wien, Österreich"), "AT");
  assert.equal(countryInText("Schweizweit"), "CH");
  assert.equal(countryInText("ganze Schweiz"), "CH");
  assert.equal(countryInText("Homeoffice"), undefined);
  assert.equal(countryInText("Darmstadt"), undefined);
  assert.equal(countryInText(""), undefined);
});

test("listing country: structured code first, then the geocoded locality, text, canton, Swiss-only source", () => {
  assert.equal(detectListingCountry({ location: "Bendern" }, { structured: "LI" }), "LI");
  assert.equal(detectListingCountry({ location: "Vaduz" }, { matchedCanton: "FL" }), "LI");
  assert.equal(detectListingCountry({ location: "Bern" }, { matchedCanton: "BE" }), "CH");
  assert.equal(detectListingCountry({ location: "Lörrach, Deutschland" }), "DE");
  assert.equal(detectListingCountry({ location: "Winterthur ZH" }), "CH");
  assert.equal(detectListingCountry({ location: "Irgendwo", canton: "ZH" }), "CH");
  assert.equal(detectListingCountry({ location: "Darmstadt" }), undefined);
  assert.equal(detectListingCountry({ location: "Homeoffice" }), undefined);
  assert.equal(detectListingCountry({ location: "Homeoffice" }, { swissSource: true }), "CH");
  assert.equal(detectListingCountry({}, { structured: "nonsense" }), undefined);
  // browser fallback for results without `country`: a canton means Switzerland
  assert.equal(listingCountry({ canton: "BE" }), "CH");
  assert.equal(listingCountry({ country: "DE", canton: undefined }), "DE");
  assert.equal(countryLabel("LI"), "Liechtenstein");
  assert.equal(countryLabel(undefined), "Land unbekannt");
});

test("search API sets the country: Swiss places, Liechtenstein, Germany, remote; Yousty counts as Swiss", async (context) => {
  const { searchMultipleSources } = await load();
  const jobs = [[1, "Stadtwerk Winterthur", "Winterthur", "Lehrstelle"], [2, "Rhein IT Anstalt", "Vaduz", "Lehrstelle"], [3, "Hessen Software GmbH", "Darmstadt", "Lehrstelle"],
    [4, "Remote AG", "Homeoffice", "Lehrstelle"], [5, "Grenz GmbH", "D-79539 Lörrach", "Lehrstelle"], [6, "Rothenburg AG", "Rothenburg / Luzern", "Lehrstelle"]];
  installWorld(context, { jobs });
  const { results } = await loadAll(searchMultipleSources, { query: "Informatiker", location: "", kind: "apprenticeship" });
  const byCompany = Object.fromEntries(results.map((r) => [r.company, r.country]));
  assert.equal(byCompany["Stadtwerk Winterthur"], "CH");
  assert.equal(byCompany["Rothenburg AG"], "CH");
  assert.equal(byCompany["Rhein IT Anstalt"], "LI");
  assert.equal(byCompany["Grenz GmbH"], "DE");
  assert.equal(byCompany["Hessen Software GmbH"], undefined);
  assert.equal(byCompany["Remote AG"], undefined);
  // Yousty lists Swiss apprenticeships only: also its listings without a usable place are Swiss
  assert.equal(byCompany["Ohne Ort AG"], "CH");
  assert.equal(byCompany["Überall AG"], "CH");
  assert.equal(results.filter((r) => r.source === "Yousty").length, Object.values(YOUSTY).flat().length);

  // default "Schweiz" hides exactly the four non-Swiss / unknown ones; "Alle" shows everything
  const swiss = applyJobFilters(results, emptyFilters());
  assert.equal(results.length - swiss.length, 4);
  assert.equal(applyJobFilters(results, { ...emptyFilters(), country: "all" }).length, results.length);
});

test("real jobs.ch page: the structured countryCode is read", () => {
  return load().then(({ parseJobsHtml, jobsStateLocations }) => {
    const page = fixture("jobs-informatiker-lehrstelle-p1.html");
    assert.ok([...jobsStateLocations(page).values()].every((loc) => loc.country === "CH"));
    assert.ok(parseJobsHtml(page).some((r) => r.country === "CH"));
    const li = page.replace('"countryCode":"CH"', '"countryCode":"LI"');
    assert.ok([...jobsStateLocations(li).values()].some((loc) => loc.country === "LI"));
  });
});

const LISTINGS = [
  job("A Zürich", { location: "Zürich", canton: "ZH", country: "CH", jobType: "lehrstelle" }),
  job("B Bern", { location: "Bern", canton: "BE", country: "CH", jobType: "lehrstelle" }),
  job("C Vaduz", { location: "Vaduz", country: "LI", jobType: "lehrstelle" }),
  job("D Konstanz", { location: "Konstanz", country: "DE", jobType: "praktikum" }),
  job("E Homeoffice", { location: "Homeoffice", jobType: "praktikum" }),
  job("F legacy", { location: "Winterthur ZH" }), // older result without `country`: canton in the text = Switzerland
];

test("filter: Schweiz (default) keeps only Swiss listings, Alle keeps everything", () => {
  assert.deepEqual(applyJobFilters(LISTINGS, emptyFilters()).map((j) => j.title), ["A Zürich", "B Bern", "F legacy"]);
  assert.equal(applyJobFilters(LISTINGS, { ...emptyFilters(), country: "all" }).length, LISTINGS.length);
  // a canton chip never shows listings known to be abroad; an unknown place keeps the usual "missing data stays" rule
  assert.deepEqual(applyJobFilters(LISTINGS, { ...emptyFilters(), country: "all", cantons: ["ZH"] }).map((j) => j.title), ["A Zürich", "E Homeoffice", "F legacy"]);
  assert.deepEqual(applyJobFilters(LISTINGS, { ...emptyFilters(), cantons: ["ZH"] }).map((j) => j.title), ["A Zürich", "F legacy"]);
});

test("facets: Schweiz/Alle counts ignore the toggle itself, other counts react to it", () => {
  const ch = computeFacets(LISTINGS, emptyFilters());
  assert.deepEqual(ch.country, { ch: 3, all: 6 });
  assert.equal(ch.total, 3);
  assert.equal(ch.jobTypes.praktikum ?? 0, 0);
  const all = computeFacets(LISTINGS, { ...emptyFilters(), country: "all" });
  assert.deepEqual(all.country, { ch: 3, all: 6 });
  assert.equal(all.total, 6);
  assert.equal(all.jobTypes.praktikum, 2);
  // canton counts stay consistent with the list (only Swiss listings have a canton)
  assert.deepEqual(all.cantons, ch.cantons);
  // other filters narrow the toggle's counts (the legacy listing has no job type and stays, as usual for missing data)
  assert.deepEqual(computeFacets(LISTINGS, { ...emptyFilters(), jobTypes: ["praktikum"] }).country, { ch: 1, all: 3 });
});

test("URL: Alle is land=alle, Schweiz is the default and old links (no param) mean Schweiz", () => {
  const base = { query: "Informatiker", filters: emptyFilters(), sort: "relevance" };
  assert.equal(stateToParams(base).get("land"), null);
  const params = stateToParams({ ...base, filters: { ...emptyFilters(), country: "all" } });
  assert.equal(params.get("land"), "alle");
  assert.equal(paramsToState(params).filters.country, "all");
  assert.equal(paramsToState("?q=Informatiker&k=a&c=ZH").filters.country, undefined);
  assert.deepEqual(paramsToState("?q=Informatiker&k=a").filters, emptyFilters());
  assert.equal(paramsToState("?q=x&land=ALLE").filters.country, "all");
  assert.equal(paramsToState("?q=x&land=mars").filters.country, undefined);
});

test("active filter count (Zurücksetzen) and saved searches include the toggle", () => {
  assert.equal(activeFilterCount(emptyFilters()), 0);
  assert.equal(activeFilterCount({ ...emptyFilters(), country: "all" }), 1);
  const storage = memory();
  savePreset("Auch Ausland", { query: "Informatiker", filters: { ...emptyFilters(), country: "all" }, sort: "relevance" }, storage);
  savePreset("Nur Schweiz", { query: "Informatiker", filters: emptyFilters(), sort: "relevance" }, storage);
  const presets = Object.fromEntries(loadPresets(storage).map((p) => [p.name, p.state.filters.country]));
  assert.deepEqual(presets, { "Auch Ausland": "all", "Nur Schweiz": undefined });
});
