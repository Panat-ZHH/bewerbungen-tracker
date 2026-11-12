import assert from "node:assert/strict";
import { test } from "node:test";
import { expandQuery, editDistance, fold, tokenize } from "../lib/job-filters/query.ts";
import { rankJobs, highlightSegments } from "../lib/job-filters/rank.ts";
import { applyJobFilters, activeFilterCount } from "../lib/job-filters/filter.ts";
import { dedupeJobs } from "../lib/job-filters/dedupe.ts";
import { classifyJob, parseWorkload } from "../lib/job-filters/taxonomy.ts";
import { stateToParams, paramsToState } from "../lib/job-filters/url.ts";
import { addRecent, loadRecent, savePreset, loadPresets, deletePreset, addRecentTo, RECENT_KEY } from "../lib/job-filters/storage.ts";
import { computeFacets } from "../lib/job-filters/facets.ts";
import { sortJobs } from "../lib/job-filters/sort.ts";
import { plzToCanton, resolveLocation, distanceKm } from "../lib/job-filters/geo.ts";
import { locateListing } from "../lib/geo/places.ts";
import { searchJobs } from "../lib/job-filters/index.ts";
import { emptyFilters } from "../lib/job-filters/types.ts";

const NOW = Date.parse("2026-11-06T12:00:00Z");
const job = (title, extra = {}) => ({ title, url: `https://x.ch/${encodeURIComponent(title)}${extra.company ?? ""}`, source: "Yousty", ...extra });
const state = (query = "", filters = {}, sort = "relevance") => ({ query, filters: { ...emptyFilters(), ...filters }, sort });
const memory = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), map: m }; };

test("fold/tokenize handle umlauts, digraphs, gender markers and stopwords", () => {
  assert.equal(fold("Zürich"), fold("Zuerich"));
  assert.equal(fold("Zürich"), "zurich");
  assert.deepEqual(tokenize("Informatiker/in EFZ (m/w/d)"), ["informatiker", "efz"]);
  assert.deepEqual(tokenize("Lehrstelle als Kauffrau in Bern"), ["lehrstelle", "kauffrau", "bern"]);
  assert.equal(editDistance("informatik", "infromatik"), 1);
});

test("query expansion knows Swiss synonyms and tolerates typos in them", () => {
  const q = expandQuery("Lehre Informatiker");
  assert.equal(q.terms.length, 2);
  const lehre = q.terms[0].alts.map((a) => a.tokens.join(" "));
  assert.ok(lehre.includes("efz") && lehre.includes("lehrstelle") && lehre.includes("ausbildung"));
  const multi = expandQuery("Fachmann Information");
  assert.equal(multi.terms.length, 1);
  assert.ok(multi.terms[0].alts.some((a) => a.tokens.join(" ") === "informatiker"));
  const typo = expandQuery("Informatikr");
  assert.ok(typo.terms[0].alts.some((a) => a.tokens[0] === "informatiker"));
  assert.ok(expandQuery("Kauffrau").terms[0].alts.some((a) => a.tokens[0] === "kaufmann"));
  assert.ok(expandQuery("Praktikum").hints[0].synonyms.length > 0);
  assert.deepEqual(expandQuery("").terms, []);
});

test("ranking: title beats company beats snippet; synonyms and typos match; highlights point into the original text", () => {
  const jobs = [
    job("Verkauf Berater", { company: "Informatik AG" }),
    job("Informatiker/in EFZ Applikationsentwicklung", { company: "Beta AG" }),
    job("Büro Allrounder", { snippet: "Du arbeitest mit Informatik Tools" }),
    job("Gärtner", { company: "Grün AG" }),
  ];
  const ranked = rankJobs(jobs, state("Informatiker"), NOW);
  assert.equal(ranked[0].job.title, "Informatiker/in EFZ Applikationsentwicklung");
  assert.equal(ranked.length, 3);
  assert.ok(ranked[0].score > ranked[1].score && ranked[1].score > ranked[2].score);
  const hit = ranked[0].matches.find((m) => m.field === "title");
  const [s, e] = hit.ranges[0];
  assert.equal(ranked[0].job.title.slice(s, e), "Informatiker");
  assert.equal(rankJobs(jobs, state("infromatiker"), NOW)[0].job.title, ranked[0].job.title);
  assert.equal(rankJobs([job("Kaufmann EFZ")], state("Lehre Kauffrau"), NOW).length, 1);
  assert.deepEqual(rankJobs(jobs, state("zzzqqq"), NOW), []);
  assert.deepEqual(highlightSegments("Hallo Welt", [[0, 5]]), [{ text: "Hallo", hit: true }, { text: " Welt", hit: false }]);
});

test("ranking is stable, boosts recent listings and keeps everything for an empty query", () => {
  const jobs = [job("A", { company: "x" }), job("B", { company: "y" }), job("C", { company: "z", postedAt: "2026-11-05" })];
  const ranked = rankJobs(jobs, state(""), NOW);
  assert.deepEqual(ranked.map((r) => r.job.title), ["C", "A", "B"]);
  const same = rankJobs([job("Koch", { company: "a" }), job("Koch", { company: "b" })], state("koch"), NOW);
  assert.deepEqual(same.map((r) => r.job.company), ["a", "b"]);
  const input = JSON.stringify(jobs);
  rankJobs(jobs, state("a"), NOW);
  assert.equal(JSON.stringify(jobs), input);
});

test("geo: PLZ, cities, canton codes, distance", () => {
  assert.equal(plzToCanton("8001"), "ZH");
  assert.equal(plzToCanton(3011), "BE");
  assert.equal(plzToCanton(4051), "BS");
  assert.equal(resolveLocation("8001 Zürich").canton, "ZH");
  assert.equal(resolveLocation("Winterthur ZH").city, "winterthur");
  assert.equal(resolveLocation("Gemeinde Foo, VD").canton, "VD");
  assert.equal(resolveLocation("Kanton Waadt").canton, "VD");
  assert.equal(resolveLocation(""), undefined);
  const km = distanceKm({ lat: 47.377, lon: 8.54 }, { lat: 46.948, lon: 7.447 });
  assert.ok(km > 80 && km < 100);
});

test("filters: canton, type, workload overlap, year, education, source, posted, remote, salary, saved", () => {
  const jobs = [
    job("Informatiker EFZ Lehrbeginn 2027", { company: "A AG", location: "8001 Zürich" }),
    job("Teilzeit Sachbearbeiter 60-80%", { company: "B AG", location: "Bern", source: "jobs.ch", postedAt: "2026-11-05", salaryMin: 70000 }),
    job("Praktikum Marketing", { company: "C AG", location: "Basel", source: "jobup.ch", postedAt: "2026-09-01", remote: "hybrid" }),
    job("Mystery Job", { company: "D AG" }),
  ].map((listing) => locateListing(listing).job); // as delivered by the search API: place normalised, canton from the localities directory
  const f = (filters, options) => applyJobFilters(jobs, { ...emptyFilters(), ...filters }, { now: NOW, ...options }).map((j) => j.company);
  assert.deepEqual(f({}), ["A AG", "B AG", "C AG", "D AG"]);
  assert.deepEqual(f({ cantons: ["ZH"] }), ["A AG", "D AG"]);
  assert.deepEqual(f({ cantons: ["ZH"] }, { strict: true }), ["A AG"]);
  assert.deepEqual(f({ jobTypes: ["lehrstelle"] }), ["A AG", "D AG"]);
  assert.deepEqual(f({ jobTypes: ["teilzeit"] }, { strict: true }), ["B AG"]);
  assert.deepEqual(f({ workloadMin: 70, workloadMax: 100 }, { strict: true }), ["B AG"]);
  assert.deepEqual(f({ workloadMin: 90 }, { strict: true }), []);
  assert.deepEqual(f({ startYear: 2027 }, { strict: true }), ["A AG"]);
  assert.deepEqual(f({ education: ["efz"] }, { strict: true }), ["A AG"]);
  assert.deepEqual(f({ sources: ["jobs.ch", "jobup.ch"] }), ["B AG", "C AG"]);
  assert.deepEqual(f({ postedWithin: 7 }, { strict: true }), ["B AG"]);
  assert.deepEqual(f({ remote: "hybrid" }, { strict: true }), ["C AG"]);
  assert.deepEqual(f({ salaryMin: 60000 }, { strict: { salaryMin: true } }), ["B AG"]);
  assert.deepEqual(f({ companies: ["b ag"] }), ["B AG"]);
  assert.deepEqual(f({ hideSaved: true }, { savedUrls: [jobs[0].url] }), ["B AG", "C AG", "D AG"]);
  // the radius filter only applies the distances the search API put on the listings (details: tests/ort-suche-filter.test.mjs)
  const placed = [{ ...jobs[0], distanceKm: 0, inPlace: true }, { ...jobs[1], distanceKm: 95.5 }, { ...jobs[2], distanceKm: 74.3 }, jobs[3]];
  const r = (filters, options) => applyJobFilters(placed, { ...emptyFilters(), ...filters }, { now: NOW, ...options }).map((j) => j.company);
  assert.deepEqual(r({ location: "Zürich", radiusKm: 20 }, { strict: true }), ["A AG"]);
  assert.deepEqual(r({ location: "Zürich", radiusKm: 0 }, { strict: true }), ["A AG"]);
  assert.deepEqual(r({ location: "", radiusKm: 20 }, { strict: true }), ["A AG", "B AG", "C AG", "D AG"]);
  assert.equal(activeFilterCount({ ...emptyFilters(), cantons: ["ZH"], remote: "remote" }), 2);
});

test("classification: workload, education, type, start year, remote, field", () => {
  assert.deepEqual(parseWorkload("Pensum 80-100%"), { min: 80, max: 100 });
  assert.deepEqual(parseWorkload("60 %"), { min: 60, max: 60 });
  const c = classifyJob({ title: "Polymechaniker/in EFZ, Lehrbeginn 2027", location: "8400 Winterthur ZH", snippet: "Homeoffice nach Absprache" });
  // without a canton in the text the canton comes from the localities directory (search API), not from the browser-side classifier
  assert.equal(locateListing({ title: "x", location: "8400 Winterthur" }).job.canton, "ZH");
  assert.equal(c.jobType, "lehrstelle");
  assert.equal(c.education, "efz");
  assert.equal(c.startDate, "2027");
  assert.equal(c.canton, "ZH");
  assert.equal(c.remote, "hybrid");
  assert.equal(c.field, "technik-industrie");
  assert.equal(classifyJob({ title: "Praktikum 50%" }).jobType, "praktikum");
  assert.equal(classifyJob({ title: "Senior Software Engineer 80-100%" }).field, "informatik");
  assert.equal(classifyJob({ title: "Dev", snippet: "100% remote" }).remote, "remote");
});

test("dedupe merges the same listing across sources and keeps enrichment and all links", () => {
  const out = dedupeJobs([
    { title: "Kaufmann/-frau EFZ (m/w/d) 2027", company: "Muster AG", location: "8001 Zürich", url: "https://a/1", source: "Yousty", canton: "ZH" },
    { title: "Kauffrau / Kaufmann", company: "Muster", location: "Zürich", url: "https://b/2", source: "jobs.ch", postedAt: "2026-11-01", snippet: "Langer Text hier" },
    { title: "Kaufmann EFZ 2028", company: "Muster AG", location: "Zürich", url: "https://c/3", source: "jobs.ch" },
    { title: "Kaufmann EFZ", company: "Muster AG", location: "Bern", url: "https://d/4", source: "jobs.ch" },
  ]);
  assert.equal(out.length, 3);
  assert.deepEqual(out[0].sources.map((s) => s.url).sort(), ["https://a/1", "https://b/2"]);
  assert.equal(out[0].postedAt, "2026-11-01");
  assert.equal(out[0].canton, "ZH");
  assert.equal(out[0].snippet, "Langer Text hier");
  assert.equal(dedupeJobs([{ title: "X", url: "https://z", source: "a" }, { title: "Y", url: "https://z", source: "a" }]).length, 1);
});

test("URL round trip with short keys; invalid values are dropped", () => {
  const s = state("Informatiker EFZ", {
    kind: "job", location: "Zürich", radiusKm: 20, cantons: ["ZH", "BE"], jobTypes: ["lehrstelle", "teilzeit"], workloadMin: 60, workloadMax: 100,
    fields: ["informatik"], startYear: 2027, education: ["efz"], languages: ["de", "en"], companies: ["Muster, Meier & Co", "B AG"], sources: ["Yousty", "jobs.ch"],
    postedWithin: 7, remote: "hybrid", salaryMin: 80000, onlyNew: true, hideSaved: true,
  }, "newest");
  const params = stateToParams(s);
  assert.deepEqual(paramsToState(params.toString()), s);
  assert.ok(params.has("q") && params.has("so") && !params.has("sort"));
  assert.equal(stateToParams(state("")).has("so"), false);
  const bad = paramsToState("q=x&c=ZH,XX&t=lehrstelle,foo&r=7&wn=5&y=1999&p=9&rm=moon&so=bogus&e=efz,phd&g=de,xx&s=Yousty,evil");
  assert.deepEqual(bad.filters.cantons, ["ZH"]);
  assert.deepEqual(bad.filters.jobTypes, ["lehrstelle"]);
  assert.equal(bad.filters.radiusKm, undefined);
  assert.equal(bad.filters.workloadMin, undefined);
  assert.equal(bad.filters.startYear, undefined);
  assert.equal(bad.filters.postedWithin, undefined);
  assert.equal(bad.filters.remote, undefined);
  assert.equal(bad.sort, "relevance");
  assert.deepEqual(bad.filters.education, ["efz"]);
  assert.deepEqual(bad.filters.languages, ["de"]);
  assert.deepEqual(bad.filters.sources, ["Yousty"]);
  assert.equal(paramsToState("", "job").filters.kind, "job");
  assert.deepEqual(paramsToState({ q: "a", k: ["j"] }).filters.kind, "job");
});

test("storage: recent searches (max 8, deduped, newest first) and presets, SSR-safe", () => {
  const st = memory();
  for (let i = 0; i < 10; i++) addRecent(state(`suche ${i}`), st, `2026-11-0${i % 9 + 1}T00:00:00Z`);
  addRecent(state("SUCHE 5"), st);
  const recent = loadRecent(st);
  assert.equal(recent.length, 8);
  assert.equal(recent[0].state.query, "SUCHE 5");
  assert.equal(recent.filter((r) => r.state.query.toLowerCase() === "suche 5").length, 1);
  assert.deepEqual(addRecentTo([], state("   ")), []);
  const created = savePreset("Zürich IT", state("it", { cantons: ["ZH"] }), st);
  assert.equal(created.length, 1);
  savePreset("zürich it", state("it2"), st);
  assert.equal(loadPresets(st).length, 1);
  assert.equal(loadPresets(st)[0].state.query, "it2");
  assert.equal(deletePreset(loadPresets(st)[0].id, st).length, 0);
  st.setItem(RECENT_KEY, "{kaputt");
  assert.deepEqual(loadRecent(st), []);
  assert.deepEqual(loadRecent(), []); // no localStorage in node
  assert.doesNotThrow(() => addRecent(state("x")));
});

test("facets are disjunctive and count per value", () => {
  const jobs = [
    job("Informatiker EFZ", { company: "A", canton: "ZH", source: "Yousty" }),
    job("Informatiker EFZ", { company: "B", canton: "ZH", source: "jobs.ch" }),
    job("Informatiker EFZ", { company: "C", canton: "BE", source: "jobs.ch" }),
    job("Koch EFZ", { company: "D", canton: "BE", source: "Yousty" }),
  ];
  const facets = computeFacets(jobs, { ...emptyFilters(), cantons: ["ZH"], fields: ["informatik"] }, { now: NOW });
  assert.equal(facets.total, 2);
  assert.deepEqual(facets.cantons, { ZH: 2, BE: 1 });
  assert.deepEqual(facets.sources, { Yousty: 1, "jobs.ch": 1 });
  assert.equal(facets.fields.informatik, 2);
  assert.equal(facets.fields["gastro-hotel"], undefined); // Koch is in BE, outside the canton filter
  assert.equal(computeFacets(jobs, { ...emptyFilters(), fields: ["informatik"] }, { now: NOW }).cantons.ZH, 2);
  assert.equal(facets.jobTypes.lehrstelle, 2);
  assert.equal(Object.keys(facets.companies).length, 2);
});

test("sorting: newest/company/location/start with missing data last, stable, non-mutating", () => {
  const ranked = rankJobs([
    job("a", { company: "Zeta", location: "Bern", postedAt: "2026-10-01", startDate: "2028" }),
    job("b", { company: "alpha", location: "Aarau", postedAt: "2026-11-01", startDate: "2027" }),
    job("c", {}),
    job("d", { company: "Beta", postedAt: "2026-11-01" }),
  ], state(""), NOW);
  const titles = (sort) => sortJobs(ranked, sort).map((r) => r.job.title).join("");
  assert.equal(titles("newest"), "bdac");
  assert.equal(titles("company"), "bdac");
  assert.equal(titles("location"), "badc");
  assert.equal(titles("start"), "badc");
  assert.equal(ranked.map((r) => r.job.title).join(""), titles("relevance"));
});

test("searchJobs pipeline: dedupe -> filter -> rank -> sort with facets", () => {
  const jobs = [
    job("Informatiker EFZ", { company: "A AG", location: "Zürich" }),
    job("Informatiker/in EFZ", { company: "A", location: "8001 Zürich", url: "https://other/1", source: "jobs.ch" }),
    job("Koch", { company: "B AG", location: "Bern" }),
  ];
  const out = searchJobs(jobs, state("Lehre Informatik", { cantons: ["ZH"] }), { now: NOW });
  assert.equal(out.total, 1);
  assert.equal(out.results[0].job.sources.length, 2);
  assert.equal(out.facets.cantons.ZH, 1);
});
