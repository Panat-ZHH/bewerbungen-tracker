import assert from "node:assert/strict";
import { test } from "node:test";
import { findProfessionSlug, parseJobsHtml, parseYoustyHtml, searchJobs } from "../lib/job-search.ts";

const jobCard = `<div data-cy="serp-item"><a data-cy="job-link" title="Informatiker/in" href="/de/stellenangebote/detail/abc-123/"><div><span>Arbeitsort:</span><p>Zürich</p></div><p class="fw_bold">Beispiel AG</p></a></div>`;
const apprenticeshipCard = `<div class="title_and_location"><a href="/de-CH/lehrstellen/profile/124-informatiker-ubs"><h2 class="title">Informatiker EFZ</h2><div class="company-info">Bei <strong>UBS</strong> in <strong>Zürich</strong></div></a></div>`;
const professions = `<a href="/de-CH/lehrstellen/berufe/informatik/1712-informatiker-in-efz">Informatiker EFZ</a><a href="/de-CH/lehrstellen/berufe/informatik/1709-informatiker-in-efz-applikationsentwicklung">Applikationsentwicklung</a>`;

test("jobs parser extracts original links, company and location without duplicates", () => {
  assert.deepEqual(parseJobsHtml(jobCard + jobCard), [{ title: "Informatiker/in", company: "Beispiel AG", location: "Zürich", url: "https://www.jobs.ch/de/stellenangebote/detail/abc-123/", source: "jobs.ch" }]);
});

test("parsers reject external and non-listing links", () => {
  assert.equal(parseJobsHtml(jobCard.replace("/de/stellenangebote/detail/abc-123/", "https://evil.example/detail" )).length, 0);
  assert.equal(parseYoustyHtml(apprenticeshipCard.replace("/de-CH/lehrstellen/profile/124-informatiker-ubs", "javascript:alert(1)")).length, 0);
});

test("parsers cap result counts", () => {
  assert.equal(parseJobsHtml(Array.from({ length: 25 }, (_value, index) => jobCard.replace("abc-123", `abc-${index}`)).join("")).length, 20);
});

test("apprenticeship parser uses title field and not year chips", () => {
  assert.deepEqual(parseYoustyHtml(apprenticeshipCard + `<a href="/de-CH/lehrstellen/profile/124-informatiker-ubs">2027</a>`), [{ title: "Informatiker EFZ", company: "UBS", location: "Zürich", url: "https://www.yousty.ch/de-CH/lehrstellen/profile/124-informatiker-ubs", source: "Yousty" }]);
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