import assert from "node:assert/strict";
import { test } from "node:test";
import { findProfessionSlug, hasNextPage, parseJobsHtml, parseYoustyHtml, searchJobs } from "../lib/job-search.ts";
import { mergeJobResults } from "../lib/job-results.ts";

const jobCard = `<div data-cy="serp-item"><a data-cy="job-link" title="Informatiker/in" href="/de/stellenangebote/detail/abc-123/"><div><span>Arbeitsort:</span><p>Zürich</p></div><p class="fw_bold">Beispiel AG</p></a></div>`;
const apprenticeshipCard = `<div class="title_and_location"><a href="/de-CH/lehrstellen/profile/124-informatiker-ubs"><h2 class="title">Informatiker EFZ</h2><div class="company-info">Bei <strong>UBS</strong> in <strong>Zürich</strong></div></a></div>`;
const professions = `<a href="/de-CH/lehrstellen/berufe/informatik/1712-informatiker-in-efz">Informatiker EFZ</a><a href="/de-CH/lehrstellen/berufe/informatik/1709-informatiker-in-efz-applikationsentwicklung">Applikationsentwicklung</a>`;

test("cross-source duplicates combine original links without changing primary identity", () => {
  const first = { title: "Informatiker/in EFZ Applikationsentwicklung", company: "Beispiel AG", location: "Zürich", url: "https://www.yousty.ch/de-CH/lehrstellen/profile/1-test", source: "Yousty" };
  const second = { ...first, title: "Lehrstelle als Informatiker:in EFZ Applikationsentwicklung (m/w/d)", company: "Beispiel", location: "8000 Zürich ZH", url: "https://www.jobs.ch/de/stellenangebote/detail/abc-123/", source: "jobs.ch" };
  const results = mergeJobResults([first], [second, second]);
  assert.equal(results.length, 1);
  assert.equal(results[0].url, first.url);
  assert.deepEqual(results[0].sources.map((source) => source.name), ["Yousty", "jobs.ch"]);
});

test("different specializations, locations and explicit years stay separate", () => {
  const first = { title: "Informatiker EFZ 2027", company: "Beispiel AG", location: "Zürich", url: "https://example.invalid/1", source: "First" };
  for (const change of [{ title: "Informatiker EFZ 2028" }, { location: "Bern" }, { title: "Informatiker EFZ Applikationsentwicklung 2027" }, { company: undefined }]) {
    assert.equal(mergeJobResults([first], [{ ...first, ...change, url: "https://example.invalid/2" }]).length, 2);
  }
});

test("a late year annotation does not merge different apprenticeship cohorts", () => {
  const first = { title: "Informatiker EFZ", company: "Beispiel AG", location: "Zürich", url: "https://example.invalid/1", source: "First" };
  const annotated = mergeJobResults([first], [{ ...first, title: "Lehrstelle Informatiker EFZ 2027", url: "https://example.invalid/2" }]);
  assert.deepEqual(annotated[0].years, ["2027"]);
  assert.equal(mergeJobResults(annotated, [{ ...first, title: "Lehrstelle Informatiker EFZ 2028", url: "https://example.invalid/3" }]).length, 2);
});

test("jobs parser extracts original links, company and location without duplicates", () => {
  assert.deepEqual(parseJobsHtml(jobCard + jobCard), [{ title: "Informatiker/in", company: "Beispiel AG", location: "Zürich", url: "https://www.jobs.ch/de/stellenangebote/detail/abc-123/", source: "jobs.ch" }]);
});

test("parsers reject external and non-listing links", () => {
  assert.equal(parseJobsHtml(jobCard.replace("/de/stellenangebote/detail/abc-123/", "https://evil.example/detail" )).length, 0);
  assert.equal(parseYoustyHtml(apprenticeshipCard.replace("/de-CH/lehrstellen/profile/124-informatiker-ubs", "javascript:alert(1)")).length, 0);
});

test("parsers preserve all source entries so batch cursors do not skip the remainder", () => {
  assert.equal(parseJobsHtml(Array.from({ length: 40 }, (_value, index) => jobCard.replace("abc-123", `abc-${index}`)).join("")).length, 40);
});

test("apprenticeship parser uses title field and not year chips", () => {
  assert.deepEqual(parseYoustyHtml(apprenticeshipCard + `<a href="/de-CH/lehrstellen/profile/124-informatiker-ubs">2027</a>`), [{ title: "Informatiker EFZ", company: "UBS", location: "Zürich", url: "https://www.yousty.ch/de-CH/lehrstellen/profile/124-informatiker-ubs", source: "Yousty", contract: "Lehrstelle", jobType: "lehrstelle", education: "efz" }]);
});

test("profession matching resolves general and specific user searches", () => {
  assert.equal(findProfessionSlug(professions, "Informatiker"), "1712-informatiker-in-efz");
  assert.equal(findProfessionSlug(professions, "Informatiker Applikationsentwicklung"), "1709-informatiker-in-efz-applikationsentwicklung");
  assert.equal(findProfessionSlug(professions, "Schreiner"), undefined);
});

test("empty query makes no external requests", async (context) => {
  const fetchMock = context.mock.method(globalThis, "fetch", async () => { throw new Error("Unexpected fetch"); });
  await assert.rejects(searchJobs({ query: " ", location: "", kind: "job" }), /Beruf/);
  assert.equal(fetchMock.mock.calls.length, 0);
});

test("robots disallow blocks source search", async (context) => {
  const fetchMock = context.mock.method(globalThis, "fetch", async () => new Response("User-agent: *\nDisallow: /de/stellenangebote/\n"));
  await assert.rejects(searchJobs({ query: "Informatiker", location: "Zürich", kind: "job" }), /erlaubt/);
  assert.equal(fetchMock.mock.calls.length, 1);
});

test("apprenticeship query fetches profession and location-specific page, never all listings", async (context) => {
  const requests = [];
  context.mock.method(globalThis, "fetch", async (url, options) => {
    requests.push({ url: String(url), method: options?.method || "GET" });
    if (String(url).endsWith("/robots.txt")) return new Response("User-agent: *\nAllow: /\n");
    if (String(url).endsWith("/lehrstellen/berufe")) return new Response(professions, { headers: { "Content-Type": "text/html" } });
    if (options?.method === "HEAD") return new Response(null, { status: 302, headers: { Location: "/de-CH/lehrstellen/ZH/Zuerich" } });
    assert.equal(String(url), "https://www.yousty.ch/de-CH/lehrstellen/ZH/Zuerich/1712-informatiker-in-efz");
    return new Response(apprenticeshipCard, { headers: { "Content-Type": "text/html" } });
  });
  const results = await searchJobs({ query: "Informatiker", location: "Zürich", kind: "apprenticeship" });
  assert.equal(results[0].location, "Zürich");
  assert.equal(requests.filter((request) => request.url.includes("user_place") && request.method === "GET").length, 0);
});

test("unresolved apprenticeship profession does not fetch vacancies", async (context) => {
  context.mock.method(globalThis, "fetch", async (url) => {
    assert.equal(String(url), "https://www.yousty.ch/de-CH/lehrstellen/berufe");
    return new Response(professions, { headers: { "Content-Type": "text/html" } });
  });
  await assert.rejects(searchJobs({ query: "Schreiner", location: "Zürich", kind: "apprenticeship" }), /nicht gefunden/);
});

test("verified jobs.ch empty title returns zero results but unknown HTML is an error", async (context) => {
  const { searchJobs: isolatedSearch } = await import("../lib/job-search.ts?empty-test");
  let emptyPage = true;
  context.mock.method(globalThis, "fetch", async (url) => {
    if (String(url).endsWith("/robots.txt")) return new Response("User-agent: *\nAllow: /\n");
    return new Response(emptyPage ? "<title>Keine Zzzxxyy Jobs - jobs.ch</title>" : "<title>Blocked</title>", { headers: { "Content-Type": "text/html" } });
  });
  assert.deepEqual(await isolatedSearch({ query: "Zzzxxyy", location: "", kind: "job" }), []);
  emptyPage = false;
  await assert.rejects(isolatedSearch({ query: "Zzzxxyy", location: "", kind: "job" }), /nicht lesen/);
});

test("pagination accepts only the next page on the same source and path", () => {
  const url = new URL("https://www.yousty.ch/de-CH/lehrstellen/1712-informatiker-in-efz");
  assert.equal(hasNextPage('<a rel="next" href="?page=2">Weiter</a>', url, 1), true);
  assert.equal(hasNextPage('<a rel="next" href="https://evil.example/?page=2">Weiter</a>', url, 1), false);
  assert.equal(hasNextPage('<a rel="next" href="?page=1">Weiter</a>', url, 1), false);
});

test("25-result batches carry page remainders forward and exclude previously shown URLs", async (context) => {
  const { searchJobBatch } = await import("../lib/job-search.ts?pagination-test");
  const requested = [];
  context.mock.method(globalThis, "fetch", async (input) => {
    const url = new URL(input);
    if (url.pathname === "/robots.txt") return new Response("User-agent: *\nAllow: /\n");
    if (url.pathname.endsWith("/berufe")) return new Response(professions, { headers: { "Content-Type": "text/html" } });
    const page = Number(url.searchParams.get("page") || 1);
    requested.push(page);
    const entries = Array.from({ length: 10 }, (_value, index) => apprenticeshipCard.replace("124-informatiker-ubs", `${(page - 1) * 10 + index + 1}-informatiker-ubs`)).join("");
    const duplicate = page > 1 ? apprenticeshipCard.replace("124-informatiker-ubs", "1-informatiker-ubs") : "";
    const next = page < 6 ? `<a rel="next" href="?page=${page + 1}">Weiter</a>` : "";
    return new Response(duplicate + entries + next, { headers: { "Content-Type": "text/html" } });
  });
  const input = { query: "Informatiker", location: "", kind: "apprenticeship" };
  const first = await searchJobBatch(input);
  assert.equal(first.results.length, 25);
  assert.deepEqual(requested, [1, 2, 3]);
  const second = await searchJobBatch({ ...input, cursor: first.nextCursor, excludedUrls: first.results.map((result) => result.url) });
  assert.equal(second.results.length, 25);
  const combined = [...first.results, ...second.results];
  assert.equal(new Set(combined.map((result) => result.url)).size, 50);
  const final = await searchJobBatch({ ...input, cursor: second.nextCursor, excludedUrls: combined.map((result) => result.url) });
  assert.equal(final.results.length, 10);
  assert.equal(final.nextCursor, null);
});

test("a failed subsequent page preserves results and its retry cursor", async (context) => {
  const { searchJobBatch } = await import("../lib/job-search.ts?retry-test");
  let failed = true;
  context.mock.method(globalThis, "fetch", async (input) => {
    const url = new URL(input);
    if (url.pathname === "/robots.txt") return new Response("User-agent: *\nAllow: /\n");
    if (url.searchParams.get("page") === "2") {
      if (failed) return new Response("Unavailable", { status: 503 });
      return new Response(jobCard.replace("abc-123", "def-456"), { headers: { "Content-Type": "text/html" } });
    }
    return new Response(jobCard + '<link rel="next" href="?term=Informatiker&page=2">', { headers: { "Content-Type": "text/html" } });
  });
  const input = { query: "Informatiker", location: "", kind: "job" };
  const first = await searchJobBatch(input);
  assert.equal(first.results.length, 1);
  assert.deepEqual(first.nextCursor, { page: 2, offset: 0 });
  assert.match(first.warning, /Mehr laden/);
  failed = false;
  const second = await searchJobBatch({ ...input, cursor: first.nextCursor, excludedUrls: first.results.map((result) => result.url) });
  assert.equal(second.results.length, 1);
  assert.notEqual(second.results[0].url, first.results[0].url);
  assert.equal(second.nextCursor, null);
});

test("multi-source batches combine apprenticeship duplicates and update previously shown results", async (context) => {
  const { searchMultipleSources } = await import("../lib/job-search.ts?multi-test");
  context.mock.method(globalThis, "fetch", async (input) => {
    const url = new URL(input);
    if (url.pathname === "/robots.txt") return new Response("User-agent: *\nAllow: /\n");
    if (url.pathname.endsWith("/berufe")) return new Response(professions, { headers: { "Content-Type": "text/html" } });
    const title = "Informatiker EFZ";
    const html = url.hostname === "www.yousty.ch"
      ? apprenticeshipCard.replace("UBS", "Beispiel AG").replace("Informatiker EFZ", title)
      : jobCard.replace('title="Informatiker/in"', `title="Lehrstelle als ${title}"`).replace("<p>Zürich</p>", "<p>Zürich</p></div><div><span>Vertragsart:</span><p>Lehrstelle</p>");
    return new Response(html, { headers: { "Content-Type": "text/html" } });
  });
  const first = await searchMultipleSources({ query: "Informatiker", location: "", kind: "apprenticeship" });
  assert.equal(first.results.length, 1);
  assert.deepEqual(first.results[0].sources.map((source) => source.name), ["Yousty", "jobs.ch"]);
  assert.equal(first.nextCursor, null);
  const original = { ...first.results[0], sources: [first.results[0].sources[0]] };
  const followup = await searchMultipleSources({ query: "Informatiker", location: "", kind: "apprenticeship", cursor: { yousty: null, jobs: { page: 1, offset: 0 }, jobup: null }, knownResults: [original] });
  assert.equal(followup.results.length, 0);
  assert.equal(followup.updates.length, 1);
  assert.equal(followup.updates[0].sources.length, 2);
});

test("multi-source search still returns the working source and retry cursor when another fails", async (context) => {
  const { searchMultipleSources } = await import("../lib/job-search.ts?multi-failure-test");
  context.mock.method(globalThis, "fetch", async (input) => {
    const url = new URL(input);
    if (url.hostname === "www.jobup.ch") return new Response("Unavailable", { status: 503 });
    if (url.pathname === "/robots.txt") return new Response("User-agent: *\nAllow: /\n");
    return new Response(jobCard, { headers: { "Content-Type": "text/html" } });
  });
  const batch = await searchMultipleSources({ query: "Informatiker", location: "", kind: "job" });
  assert.equal(batch.results.length, 1);
  assert.equal(batch.nextCursor.jobs, null);
  assert.deepEqual(batch.nextCursor.jobup, { page: 1, offset: 0 });
  assert.equal(batch.sources.find((source) => source.name === "jobup.ch").status, "unavailable");
  assert.match(batch.warning, /jobup.ch/);
});

test("jobs.ch apprenticeship parsing excludes ordinary employment", () => {
  assert.equal(parseJobsHtml(jobCard, "jobs", true).length, 0);
  const html = jobCard.replace("<p>Zürich</p>", "<p>Zürich</p></div><div><span>Vertragsart:</span><p>Lehrstelle</p>");
  assert.equal(parseJobsHtml(html, "jobs", true).length, 1);
});

test("public searches follow bounded same-origin redirects but reject other domains", async (context) => {
  const { searchJobBatch } = await import("../lib/job-search.ts?redirect-test");
  let external = false;
  context.mock.method(globalThis, "fetch", async (input) => {
    const url = new URL(input);
    if (url.pathname === "/robots.txt") return new Response("User-agent: *\nAllow: /\n");
    if (!url.searchParams.has("canonical")) return new Response(null, { status: 302, headers: { Location: external ? "https://evil.example/search" : "/de/stellenangebote/?term=Informatiker&canonical=1" } });
    return new Response(jobCard, { headers: { "Content-Type": "text/html" } });
  });
  assert.equal((await searchJobBatch({ query: "Informatiker", location: "", kind: "job" })).results.length, 1);
  external = true;
  await assert.rejects(searchJobBatch({ query: "Informatiker", location: "", kind: "job" }), /andere Domain/);
});