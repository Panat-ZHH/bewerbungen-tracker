// The search pipeline with a place, offline: place -> coordinates, own distance filter, distance sort, sources asked for a wider area.
// Reference distances (km, from the directory): Winterthur -> Seuzach 3.9, Henggart 7.7, Effretikon 8.6, Islikon 10.1, Andelfingen 10.9,
// Fehraltorf 12.7, Volketswil 12.8, Dübendorf 14.0, Frauenfeld 14.3, Glattbrugg 14.4, Nänikon 14.8, Uster 16.9, Zürich 19.9.
import assert from "node:assert/strict";
import { test } from "node:test";
import { JOBS, YOUSTY, fixture, installWorld, jobsCard, jobsUrl, loadAll, youstyCard, youstyUrl } from "./helpers/ort-suche-world.mjs";
import { rankJobs } from "../lib/job-filters/rank.ts";
import { sortJobs } from "../lib/job-filters/sort.ts";

const url_has_plus = (urls) => urls.some((url) => url.search.includes("+"));
let instance = 0;
const load = () => import(`../lib/job-search.ts?ort-suche-${++instance}`);
const sortedByDistance = (results) => sortJobs(rankJobs(results, { query: "Informatiker" }, Date.now()), "distance").map((item) => item.job);
const places = (results) => results.map((job) => job.location);
const html = (body, status = 200) => new Response(body, { status, headers: { "Content-Type": "text/html" } });

test("Informatiker + Winterthur + 10 km: only listings within 10 km, sorted by distance, jobs.ch delivers hits", async (context) => {
  const { searchMultipleSources } = await load();
  const requests = installWorld(context);
  const { first, results, hidden } = await loadAll(searchMultipleSources, { query: "Informatiker", location: "Winterthur", kind: "apprenticeship", filters: { radiusKm: 10 } });

  assert.deepEqual({ label: first.place.label, plz: first.place.plz, canton: first.place.canton, radiusKm: first.place.radiusKm, fromQuery: first.place.fromQuery }, { label: "Winterthur", plz: "8400", canton: "ZH", radiusKm: 10, fromQuery: false });
  assert.ok(results.length > 0);
  for (const job of results) assert.ok(typeof job.distanceKm === "number" && job.distanceKm <= 10, `${job.location} ${job.distanceKm} km`);
  // what the old search showed first (Yousty's own 14 km circle) is gone, the Winterthur listings are there
  for (const far of ["Dübendorf", "Glattbrugg", "Uster", "Zürich", "Fehraltorf", "Frauenfeld", "Volketswil", "Mönchaltorf", "Andelfingen", "Islikon"]) assert.ok(!places(results).some((p) => p?.includes(far)), far);
  assert.deepEqual(places(results).sort(), ["Henggart", "Henggart", "Illnau-Effretikon", "Seuzach", "Seuzach", "Winterthur", "Winterthur", "Winterthur"]);

  const sorted = sortedByDistance(results);
  assert.deepEqual(sorted.map((job) => job.distanceKm), [...sorted.map((job) => job.distanceKm)].sort((a, b) => a - b));
  assert.deepEqual(sorted.slice(0, 3).map((job) => job.location), ["Winterthur", "Winterthur", "Winterthur"]);
  assert.equal(sorted.at(-1).location, "Illnau-Effretikon");
  assert.ok(sorted.slice(0, 3).every((job) => job.inPlace === true) && sorted.slice(3).every((job) => job.inPlace === undefined));

  // jobs.ch: the exact-place search ("location=Winterthur") found nothing; the nationwide list filtered by us delivers
  const fromJobs = results.filter((job) => job.sources.some((source) => source.name === "jobs.ch"));
  assert.deepEqual(fromJobs.map((job) => job.company).sort(), ["Seuzi Treuhand AG", "Stadtwerk Winterthur", "Weinland Treuhand AG"]);
  assert.equal(first.sources.find((source) => source.name === "jobs.ch").count, 3);
  const jobsRequests = requests.filter((url) => url.hostname === "www.jobs.ch");
  assert.ok(jobsRequests.length >= 1 && jobsRequests.every((url) => url.searchParams.get("term") === "Informatiker Lehrstelle" && !url.searchParams.has("location")));
  // 11.9 km away: recognised (place was in the company name) but outside 10 km
  assert.ok(!results.some((job) => /Loomis/.test(job.company)));

  // Yousty: the canton pages of every canton that reaches into the radius (ZH and TG), all their pages, no place page
  const youstyPaths = requests.filter((url) => url.hostname === "www.yousty.ch" && !url.pathname.endsWith("/berufe")).map((url) => `${url.pathname}${url.search}`);
  assert.deepEqual(youstyPaths, ["/de-CH/lehrstellen/ZH/1712-informatiker-in-efz", "/de-CH/lehrstellen/ZH/1712-informatiker-in-efz?page=2", "/de-CH/lehrstellen/TG/1712-informatiker-in-efz"]);
  // "Homeoffice" and the listing without any place cannot be placed: hidden and counted
  assert.equal(hidden, 2);
  assert.deepEqual(first.sources.map((source) => source.name), ["Yousty", "jobs.ch"]);
});

test("Informatiker + Uster + 'Nur dieser Ort': only Uster (the whole municipality), nothing from the neighbours", async (context) => {
  const { searchMultipleSources } = await load();
  const requests = installWorld(context);
  const { first, results } = await loadAll(searchMultipleSources, { query: "Informatiker", location: "Uster", kind: "apprenticeship", filters: { radiusKm: 0 } });
  assert.equal(first.place.radiusKm, 0);
  assert.deepEqual(places(results).sort(), ["8606 Nänikon", "8610 Uster", "Uster", "Uster"]);
  assert.ok(results.every((job) => job.inPlace === true));
  assert.deepEqual(results.map((job) => job.company).sort(), ["AZW Uster", "Näni Tech AG", "Spital Uster AG", "Uster Technologies AG"]);
  for (const neighbour of ["Volketswil", "Fehraltorf", "Mönchaltorf", "Glattpark", "Dübendorf"]) assert.ok(!places(results).some((p) => p.includes(neighbour)), neighbour);
  assert.ok(requests.every((url) => !/\/(TG|SH|AG)\//.test(url.pathname)), "only the place's own canton is needed");
});

test("Informatiker + 8450 (Andelfingen) + 20 km: listings from the Weinland / Winterthur region", async (context) => {
  const { searchMultipleSources } = await load();
  const requests = installWorld(context);
  const { first, results } = await loadAll(searchMultipleSources, { query: "Informatiker", location: "8450", kind: "apprenticeship", filters: { radiusKm: 20 } });
  assert.deepEqual([first.place.label, first.place.name, first.place.plz, first.place.canton], ["8450 Andelfingen", "Andelfingen", "8450", "ZH"]);
  for (const job of results) assert.ok(job.distanceKm <= 20, `${job.location} ${job.distanceKm}`);
  const found = places(results);
  for (const expected of ["Andelfingen", "Henggart", "Seuzach", "Winterthur", "Schaffhausen", "Frauenfeld", "Islikon", "Illnau-Effretikon", "Kloten"]) assert.ok(found.includes(expected), expected);
  // the jobs.ch listing without a place field ("Loomis Schweiz AG Kloten") is found, placed in Kloten (17 km) and cleaned
  const loomis = results.find((job) => /Loomis/.test(job.company));
  assert.deepEqual([loomis.company, loomis.location, loomis.canton, loomis.distanceKm], ["Loomis Schweiz AG", "Kloten", "ZH", 17]);
  for (const far of ["Zürich", "Uster", "Dübendorf", "Volketswil", "Mönchaltorf", "Aarau", "Bern"]) assert.ok(!found.some((p) => p.includes(far)), far);
  const sorted = sortedByDistance(results);
  assert.equal(sorted[0].location, "Andelfingen");
  assert.equal(sorted[0].distanceKm, 0);
  // Schaffhausen and Thurgau are other cantons inside the radius: their pages are asked as well
  const cantons = new Set(requests.map((url) => url.pathname.match(/\/lehrstellen\/([A-Z]{2})\//)?.[1]).filter(Boolean));
  assert.ok(cantons.has("ZH") && cantons.has("TG") && cantons.has("SH") && !cantons.has("BE"));
});

test("listing with the place in the company name: place recognised, company cleaned, distance computed", async (context) => {
  const { searchMultipleSources, parseYoustyHtml, parseJobsHtml } = await load();
  installWorld(context);
  // jobs.ch delivers "Loomis Schweiz AG Kloten" with an empty Arbeitsort (real case, see fixture)
  const raw = parseJobsHtml(fixture("jobs-informatiker-lehrstelle-p1.html")).find((job) => /Loomis/.test(job.company));
  assert.deepEqual([raw.company, raw.location], ["Loomis Schweiz AG Kloten", undefined]);
  const all = await loadAll(searchMultipleSources, { query: "Informatiker", location: "", kind: "apprenticeship" });
  const loomis = all.results.find((job) => /Loomis/.test(job.company));
  assert.deepEqual([loomis.company, loomis.location, loomis.canton], ["Loomis Schweiz AG", "Kloten", "ZH"]);
  // Yousty: a listing that only says "in <Ort>" must not turn the place into the company
  const [onlyPlace] = parseYoustyHtml(youstyCard({ id: 900, place: "Kloten" }));
  assert.deepEqual([onlyPlace.company, onlyPlace.location], [undefined, "Kloten"]);
  const [onlyCompany] = parseYoustyHtml(youstyCard({ id: 901, company: "Loomis Schweiz AG Kloten" }));
  assert.deepEqual([onlyCompany.company, onlyCompany.location], ["Loomis Schweiz AG Kloten", undefined]);
  // the formats of the bug report, straight from the real jobs.ch response
  const pistor = parseJobsHtml(fixture("jobs-informatiker-lehrstelle-p1.html")).find((job) => /Pistor/.test(job.company));
  assert.deepEqual([pistor.location, pistor.canton], ["Rothenburg / Luzern", "LU"]);
});

test("without a place: whole Switzerland as before, nothing filtered, no distances", async (context) => {
  const { searchMultipleSources } = await load();
  const requests = installWorld(context);
  const { first, results, hidden } = await loadAll(searchMultipleSources, { query: "Informatiker", location: "", kind: "apprenticeship", filters: { radiusKm: 10 } });
  assert.equal(first.place, null);
  assert.equal(first.location, "");
  assert.equal(hidden, 0);
  const total = Object.values(YOUSTY).flat().length + JOBS.length;
  assert.equal(results.length, total);
  assert.ok(results.every((job) => job.distanceKm === undefined && job.inPlace === undefined));
  assert.ok(results.some((job) => job.company === "Ohne Ort AG") && results.some((job) => job.location === "Bern") && results.some((job) => job.location === "Basel"));
  assert.ok(requests.every((url) => !url.searchParams.has("location") && !/\/lehrstellen\/[A-Z]{2}\//.test(url.pathname)));
  // cantons are filled from the directory for the canton filter
  assert.equal(results.find((job) => job.location === "Fehraltorf").canton, "ZH");
  assert.equal(results.find((job) => job.location === "Frauenfeld" && job.source === "Yousty").canton, "TG");
});

test("the place in the search text uses the same logic as the Ort filter", async (context) => {
  const { searchMultipleSources, resolveSearch } = await load();
  installWorld(context);
  const viaFilter = await loadAll(searchMultipleSources, { query: "Informatiker", location: "Winterthur", kind: "apprenticeship" });
  const viaText = await loadAll(searchMultipleSources, { query: "Informatiker Winterthur", location: "", kind: "apprenticeship" });
  assert.deepEqual(viaText.results.map((job) => job.url).sort(), viaFilter.results.map((job) => job.url).sort());
  assert.deepEqual([viaText.first.query, viaText.first.location, viaText.first.place.fromQuery, viaText.first.place.radiusKm], ["Informatiker", "Winterthur", true, 10]);
  assert.deepEqual([viaFilter.first.query, viaFilter.first.location, viaFilter.first.place.fromQuery, viaFilter.first.place.radiusKm], ["Informatiker", "Winterthur", false, 10]);
  // the place typed twice (text and filter) is not searched as part of the profession
  assert.equal(resolveSearch({ query: "Informatiker Winterthur", location: "8400 Winterthur", kind: "apprenticeship" }).query, "Informatiker");
  assert.equal(resolveSearch({ query: "Informatiker Zürich", location: "Winterthur", kind: "apprenticeship" }).query, "Informatiker Zürich");
  // radius: default 10 km, old links with 100 km get the largest radius
  assert.equal(resolveSearch({ query: "Informatiker", location: "Uster", kind: "apprenticeship" }).radiusKm, 10);
  assert.equal(resolveSearch({ query: "Informatiker", location: "Uster", kind: "apprenticeship", filters: { radiusKm: 100 } }).radiusKm, 50);
  assert.equal(resolveSearch({ query: "Informatiker", location: "Uster", kind: "apprenticeship", filters: { radiusKm: 0 } }).radiusKm, 0);
  // a canton instead of a place searches that canton
  const aargau = await loadAll(searchMultipleSources, { query: "Informatiker Aargau", location: "", kind: "apprenticeship" });
  assert.deepEqual([aargau.first.query, aargau.first.place, aargau.first.cantons], ["Informatiker", null, ["AG"]]);
  assert.ok(aargau.results.some((job) => job.location === "Aarau" && job.source === "Yousty"));
  assert.ok(!aargau.results.some((job) => job.source === "Yousty" && job.location !== "Aarau"));
});

test("an unknown place is reported clearly and no source is asked", async (context) => {
  const { searchMultipleSources, PlaceNotFoundError } = await load();
  const requests = installWorld(context);
  await assert.rejects(searchMultipleSources({ query: "Informatiker", location: "Qqqxyz", kind: "apprenticeship" }), (error) => error instanceof PlaceNotFoundError && error.code === "unknown_place" && /Qqqxyz/.test(error.message) && /Postleitzahl/.test(error.message));
  assert.equal(requests.length, 0);
  // one typo in what the user typed is forgiven
  const typo = await searchMultipleSources({ query: "Informatiker", location: "Wintertur", kind: "apprenticeship" });
  assert.equal(typo.place.label, "Winterthur");
});

test("paging stays correct when most fetched listings are filtered out", async (context) => {
  const { searchMultipleSources } = await load();
  // 95 listings in the canton, only every 9th is in Winterthur; the rest is in Zürich (20 km away)
  const zh = Array.from({ length: 95 }, (_value, index) => [1000 + index, `Firma ${index} AG`, index % 9 === 0 ? "Winterthur" : "Zürich"]);
  const requests = installWorld(context, { yousty: { ZH: zh, TG: [] }, jobs: [] });
  const input = { query: "Informatiker", location: "Winterthur", kind: "apprenticeship", filters: { radiusKm: 5 }, pageSize: 10 };
  const { first, results, last } = await loadAll(searchMultipleSources, input);
  assert.ok(first.results.length > 0 && first.nextCursor?.yousty, "the first answer has hits and a cursor to continue");
  assert.equal(last.nextCursor, null);
  assert.deepEqual(results.map((job) => job.url).sort(), zh.filter(([, , place]) => place === "Winterthur").map(([id]) => youstyUrl(id)).sort());
  assert.equal(new Set(results.map((job) => job.url)).size, 11);
  const pages = requests.filter((url) => /\/ZH\//.test(url.pathname)).map((url) => Number(url.searchParams.get("page") || 1));
  assert.deepEqual([...new Set(pages)].sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], "every page of the canton is read");
  assert.ok(pages.length <= 20, "a page is read again at most once (when a batch ended in the middle of it)");
  assert.equal(last.sources.find((source) => source.name === "Yousty").status, "exhausted");
});

test("a failing further page keeps the loaded results, says so kindly and can be retried", async (context) => {
  const { searchMultipleSources } = await load();
  let down = true;
  installWorld(context, { respond: (url) => (down && url.hostname === "www.yousty.ch" && url.searchParams.get("page") === "2" ? html("Service Unavailable", 503) : undefined) });
  const input = { query: "Informatiker", location: "Winterthur", kind: "apprenticeship", filters: { radiusKm: 10 } };
  const first = await searchMultipleSources(input);
  // page 1 of Yousty and jobs.ch are there although page 2 of Yousty failed three times (retry with backoff)
  assert.ok(first.results.some((job) => job.source === "Yousty" && job.location === "Winterthur"));
  assert.ok(first.results.some((job) => job.sources.some((source) => source.name === "jobs.ch")));
  const yousty = first.sources.find((source) => source.name === "Yousty");
  assert.equal(yousty.status, "partial");
  assert.ok(yousty.count > 0);
  assert.match(first.warning, /^Yousty: Weitere Anzeigen konnten gerade nicht geladen werden\. Deine bisherigen Treffer bleiben da/);
  assert.doesNotMatch(first.warning, /Ergebnisseite|503|fetch|Error/);
  assert.deepEqual(first.nextCursor.yousty, { page: 2, offset: 0 });
  // "Mehr laden" while the source is still down: nothing is lost, still a friendly note, the cursor stays
  // (only Yousty is left to load, so the call fails as a whole; the browser keeps its list and its cursor – see loadMore in job-search-view.tsx)
  await assert.rejects(searchMultipleSources({ ...input, cursor: first.nextCursor, knownResults: first.results }), /^Error: Yousty: antwortet gerade nicht\. Versuch es in ein paar Minuten nochmals\.$/);
  // the source is back: the retry continues exactly where it stopped
  down = false;
  const retry = await searchMultipleSources({ ...input, cursor: first.nextCursor, knownResults: first.results });
  assert.equal(retry.warning, undefined);
  assert.equal(retry.nextCursor, null);
  const everything = [...first.results, ...retry.results];
  assert.deepEqual(everything.map((job) => job.location).sort(), ["Henggart", "Henggart", "Illnau-Effretikon", "Seuzach", "Seuzach", "Winterthur", "Winterthur", "Winterthur"]);
});

test("a source that is down from the start does not take the other source's results with it", async (context) => {
  const { searchMultipleSources } = await load();
  installWorld(context, { respond: (url) => (url.hostname === "www.yousty.ch" && !url.pathname.endsWith("/berufe") ? html("Bad Gateway", 502) : undefined) });
  const batch = await searchMultipleSources({ query: "Informatiker", location: "Winterthur", kind: "apprenticeship" });
  assert.deepEqual(batch.results.map((job) => job.company).sort(), ["Seuzi Treuhand AG", "Stadtwerk Winterthur", "Weinland Treuhand AG"]);
  const yousty = batch.sources.find((source) => source.name === "Yousty");
  assert.deepEqual([yousty.status, yousty.count], ["unavailable", 0]);
  assert.match(batch.warning, /^Yousty: antwortet gerade nicht\./);
  assert.deepEqual(batch.nextCursor.yousty, { page: 1, offset: 0 });
});

test("real Yousty responses: an empty further page ends the list instead of 'Ergebnisseite konnte nicht gelesen werden'", async (context) => {
  const { searchMultipleSources, parseYoustyHtml, hasNextPage } = await load();
  // What the old code did: the place page links to a next page that needs coordinates/distance (forbidden by robots.txt);
  // asked with ?page=2 only, Yousty answers with a page without listings.
  const placePage = fixture("yousty-place-winterthur-p1.html");
  assert.deepEqual(parseYoustyHtml(placePage).map((job) => job.location), ["Dübendorf", "Glattbrugg", "Uster", "Uster", "Zürich", "Zürich", "Winterthur", "Winterthur", "Fehraltorf", "Frauenfeld"]);
  assert.match(placePage, /rel="next" href="[^"]*distance=14/);
  assert.equal(hasNextPage(placePage, new URL("https://www.yousty.ch/de-CH/lehrstellen/ZH/Winterthur/1712-informatiker-in-efz"), 1), true);
  assert.equal(parseYoustyHtml(fixture("yousty-place-winterthur-p2.html")).length, 0);
  // Now: canton page (real response) with plain paging; a listing-free further page is simply the end.
  installWorld(context, {
    jobs: [],
    respond: (url) => (url.pathname === "/de-CH/lehrstellen/ZH/1712-informatiker-in-efz" ? html(url.searchParams.get("page") === "2" ? fixture("yousty-place-winterthur-p2.html") : fixture("yousty-canton-zh-p1.html")) : undefined),
  });
  const batch = await searchMultipleSources({ query: "Informatiker", location: "Zürich", kind: "apprenticeship", filters: { radiusKm: 10 } });
  assert.equal(batch.warning, undefined);
  assert.equal(batch.sources.find((source) => source.name === "Yousty").status, "exhausted");
  assert.ok(batch.results.length >= 5);
  assert.ok(batch.results.every((job) => job.distanceKm <= 10));
  assert.ok(batch.results.some((job) => job.location === "Zürich") && !batch.results.some((job) => job.location === "Uster" || job.location === "Niederweningen"));
});

test("real jobs.ch responses: exact-place search is empty, several locations combine, structured places are read", async () => {
  const { parseJobsHtml, jobsStateLocations } = await load();
  assert.deepEqual(parseJobsHtml(fixture("jobs-informatiker-lehrstelle-winterthur-empty.html")), []);
  const combined = parseJobsHtml(fixture("jobs-informatiker-winterthur-frauenfeld.html"));
  assert.deepEqual([...new Set(combined.map((job) => job.location))].sort(), ["Frauenfeld", "Winterthur"]);
  const page = fixture("jobs-informatiker-lehrstelle-p1.html");
  const state = jobsStateLocations(page);
  assert.ok(state.size >= 5);
  const all = parseJobsHtml(page);
  assert.equal(all.length, 20);
  assert.deepEqual([all[0].location, all[0].canton], ["St. Niklaus", "VS"]);
  // apprenticeships published as "Festanstellung" count as apprenticeships when the title says so
  const onlyApprenticeships = parseJobsHtml(page, "jobs", true);
  assert.ok(onlyApprenticeships.some((job) => job.company === "Sonova AG" && job.contract === "Festanstellung" && job.jobType === "lehrstelle"));
  assert.ok(!onlyApprenticeships.some((job) => job.company === "CEDES AG"));
  assert.equal(jobsStateLocations("<html>kaputt {\"id\":").size, 0);
});

test("jobs for adults use the same place logic (jobs.ch and jobup.ch get the place names)", async (context) => {
  const { searchMultipleSources } = await load();
  const requests = [];
  context.mock.method(globalThis, "fetch", async (input) => {
    const url = new URL(String(input));
    if (url.pathname === "/robots.txt") return new Response("User-agent: *\nAllow: /\n");
    requests.push(url);
    if (url.hostname === "www.jobup.ch") return html("<title>0 offres d'emploi trouvées sur jobup.ch</title>");
    return html(`<title>3 Informatiker Jobs - jobs.ch</title>${[[1, "A AG", "Winterthur"], [2, "B AG", "8404 Winterthur"], [3, "C AG", "Zürich"]].map(([id, company, place]) => jobsCard({ id, company, place, title: "Informatiker/in", contract: "Festanstellung" })).join("")}`);
  });
  const batch = await searchMultipleSources({ query: "Informatiker", location: "Winterthur", kind: "job", filters: { radiusKm: 5 } });
  assert.deepEqual(batch.results.map((job) => job.url).sort(), [jobsUrl(1), jobsUrl(2)]);
  assert.deepEqual(batch.results.map((job) => job.distanceKm > 0).sort(), [false, true]);
  assert.ok(batch.results.every((job) => job.inPlace));
  for (const host of ["www.jobs.ch", "www.jobup.ch"]) {
    const asked = requests.filter((request) => request.hostname === host);
    assert.equal(asked[0].searchParams.get("term"), "Informatiker");
    assert.equal(asked[0].searchParams.getAll("location")[0], "Winterthur");
    assert.ok(asked[0].searchParams.getAll("location").length > 3 && asked[0].searchParams.getAll("location").length <= 40);
    // a name with a space is never combined with other names (jobs.ch would silently drop the others)
    for (const url of asked) assert.ok(url.searchParams.getAll("location").length === 1 || url.searchParams.getAll("location").every((name) => !/\s/.test(name)), url.search);
    assert.ok(!url_has_plus(asked));
  }
  // a place with a space in its name is asked on its own first
  requests.length = 0;
  await searchMultipleSources({ query: "Informatiker", location: "St. Gallen", kind: "job", filters: { radiusKm: 5 } });
  assert.deepEqual(requests.find((request) => request.hostname === "www.jobs.ch").searchParams.getAll("location"), ["St. Gallen"]);
});
