// A small offline stand-in for Yousty and jobs.ch that behaves like the real sources do (verified live on 2026-11-11):
// - Yousty canton pages /de-CH/lehrstellen/<KT>/<slug> list the canton's apprenticeships, 10 per page, plain ?page=N paging.
// - Yousty place pages /de-CH/lehrstellen/<KT>/<Ort>/<slug> must never be requested any more (the test fails if they are).
// - jobs.ch matches `location` by the exact place name only, combines several one-word `location` parameters, 20 per page,
//   and answers "Keine … Jobs" when nothing matches. A name with a space combined with other names breaks the whole filter.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

export const fixture = (name) => readFileSync(new URL(`../fixtures/ort-suche/${name}`, import.meta.url), "utf8");
export const PROFESSIONS = `<title>Berufe | Yousty</title><a href="/de-CH/lehrstellen/berufe/informatik/1712-informatiker-in-efz">Informatiker EFZ</a>`;
const html = (body) => new Response(body, { headers: { "Content-Type": "text/html; charset=utf-8" } });
const fold = (value) => value.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").trim();

export function youstyCard({ id, title = "Informatiker/in EFZ Applikationsentwicklung", company, place }) {
  const info = [company ? `Bei <strong>${company}</strong>` : "", place ? `in <strong>${place}</strong>` : ""].filter(Boolean).join(" ");
  return `<div class="title_and_location"><a target="_blank" href="/de-CH/lehrstellen/profile/${id}-informatiker-in-efz"><h2 class="title">${title}</h2><div class="company-info">${info}</div></a></div>`;
}
export const youstyUrl = (id) => `https://www.yousty.ch/de-CH/lehrstellen/profile/${id}-informatiker-in-efz`;

export function jobsCard({ id, title = "Lehrstelle als Informatiker/in EFZ", company, place = "", contract = "Lehrstelle" }) {
  const uuid = `00000000-0000-4000-8000-${String(id).padStart(12, "0")}`;
  return `<div data-cy="serp-item"><a data-cy="job-link" id="vacancy-link-${uuid}" title="${title}" href="/de/stellenangebote/detail/${uuid}/"><div data-cy="vacancy-serp-item"><div data-cy="serp-item-${uuid}"><span><p>Vor 2 Tagen</p></span></div><div><span>${title}</span></div><div><div><span></span><span>Arbeitsort<!-- -->:</span><p>${place}</p></div><div><span></span><span>Pensum<!-- -->:</span><p>100%</p></div>${contract ? `<div><span></span><span>Vertragsart<!-- -->:</span><p>${contract}</p></div>` : ""}</div><div><div><span></span></div><p class="fw_bold">${company}</p></div></div></a></div>`;
}
export const jobsUrl = (id) => `https://www.jobs.ch/de/stellenangebote/detail/00000000-0000-4000-8000-${String(id).padStart(12, "0")}/`;

/** Apprenticeships on Yousty per canton, as [id, company, place]. Distances from Winterthur / Uster / Andelfingen are in the test file. */
export const YOUSTY = {
  ZH: [
    [101, "SV (Schweiz) AG", "Dübendorf"], [102, "Ruco AG", "Glattbrugg"], [103, "AZW Uster", "Uster"], [104, "Accenture AG", "Zürich"],
    [105, "Bison Schweiz AG", "Winterthur"], [106, "Kistler Instrumente AG", "Winterthur"], [107, "agtatec ag", "Fehraltorf"], [108, "Seuzi Informatik AG", "Seuzach"],
    [109, "Effi Solutions GmbH", "Illnau-Effretikon"], [110, "Weinland IT AG", "Andelfingen"], [111, "Volki AG", "Volketswil"], [112, "Mönchi GmbH", "Mönchaltorf"],
    [113, "Park AG", "Glattpark (Opfikon)"], [114, "Näni Tech AG", "8606 Nänikon"], [115, "Überall AG", "Homeoffice"], [116, "Ohne Ort AG", ""],
    [117, "Henggi Systems AG", "Henggart"], [118, "Uster Technologies AG", "8610 Uster"],
  ],
  TG: [[201, "UMB AG", "Frauenfeld"], [202, "Isli Soft AG", "Islikon"]],
  SH: [[301, "Munot IT AG", "Schaffhausen"]],
  AG: [[401, "Aare Digital AG", "Aarau"]],
  BE: [[501, "Bundesstadt IT AG", "Bern"]],
};

/** jobs.ch apprenticeships, as [id, company, place, contract]. */
export const JOBS = [
  [1, "Stadtwerk Winterthur", "Winterthur", "Lehrstelle"], [2, "Seuzi Treuhand AG", "Seuzach", "Festanstellung"], [3, "Loomis Schweiz AG Kloten", "", "Lehrstelle"],
  [4, "Pistor AG", "Rothenburg / Luzern", "Lehrstelle"], [5, "Kanton Zürich", "Zürich", ""], [6, "Spital Uster AG", "Uster", "Lehrstelle"],
  [7, "Weinland Treuhand AG", "Henggart", "Lehrstelle"], [8, "Spital Thurgau AG", "Frauenfeld", "Lehrstelle"], [9, "Basler IT AG", "Basel", "Lehrstelle"],
];

/**
 * Installs the mocked `fetch`. Options: `yousty`/`jobs` replace the listings, `respond(url)` may return a Response to override one request
 * (e.g. a failing page). Returns the list of requested URLs.
 */
export function installWorld(context, { yousty = YOUSTY, jobs = JOBS, respond } = {}) {
  const requests = [];
  context.mock.method(globalThis, "fetch", async (input, options) => {
    const url = new URL(String(input));
    assert.equal(options?.method ?? "GET", "GET", "only GET requests are expected");
    if (url.pathname === "/robots.txt") return new Response("User-agent: *\nAllow: /\n");
    requests.push(url);
    const override = respond?.(url);
    if (override) return override;
    const page = Number(url.searchParams.get("page") || 1);
    if (url.hostname === "www.yousty.ch") {
      if (url.pathname.endsWith("/lehrstellen/berufe")) return html(PROFESSIONS);
      const match = url.pathname.match(/^\/de-CH\/lehrstellen\/(?:([A-Z]{2})\/)?1712-informatiker-in-efz$/);
      assert.ok(match, `unexpected Yousty request ${url.pathname}${url.search} (place pages and place look-ups must not be used)`);
      const list = match[1] ? yousty[match[1]] ?? [] : Object.values(yousty).flat();
      const slice = list.slice((page - 1) * 10, page * 10);
      const next = page * 10 < list.length ? `<a rel="next" href="${url.pathname}?locale=de-CH&amp;page=${page + 1}">Weiter</a>` : "";
      const count = slice.length ? `${list.length} Lehrstellen als Informatiker/in EFZ` : "";
      return html(`<title>Informatiker/in EFZ Lehrstelle ${match[1] ?? "Schweiz"} 2027</title><p>${count}</p>${slice.map(([id, company, place]) => youstyCard({ id, company, place })).join("")}${next}`);
    }
    if (url.hostname === "www.jobs.ch") {
      const wanted = url.searchParams.getAll("location").map(fold);
      assert.ok(!url.search.includes("+"), "spaces are sent as %20 (jobs.ch redirects the + form)");
      if (wanted.length > 1 && wanted.some((name) => /\s/.test(name))) return html("<title>Keine Informatiker Jobs - jobs.ch</title>");
      const list = wanted.length ? jobs.filter(([, , place]) => wanted.includes(fold(place))) : jobs;
      const slice = list.slice((page - 1) * 20, page * 20);
      if (!slice.length) return html(`<title>Keine Informatiker Lehrstelle Jobs${wanted.length === 1 ? ` in ${url.searchParams.get("location")}` : ""} - jobs.ch</title>`);
      const nextUrl = new URL(url); nextUrl.searchParams.set("page", String(page + 1));
      const next = page * 20 < list.length ? `<a rel="next" href="${(nextUrl.pathname + nextUrl.search).replace(/&/g, "&amp;")}">Weiter</a>` : "";
      return html(`<title>${list.length} Informatiker Lehrstelle Jobs - jobs.ch</title>${slice.map(([id, company, place, contract]) => jobsCard({ id, company, place, contract })).join("")}${next}`);
    }
    throw new Error(`unexpected request ${url.href}`);
  });
  return requests;
}

/** Loads every page of a multi-source search the way the browser does ("Mehr laden" with cursor and known results). */
export async function loadAll(searchMultipleSources, input, maxCalls = 20) {
  let batch = await searchMultipleSources(input);
  const first = batch;
  let results = [...batch.results];
  let hidden = batch.hiddenWithoutPlace;
  const warnings = batch.warning ? [batch.warning] : [];
  for (let call = 1; batch.nextCursor && call < maxCalls; call++) {
    batch = await searchMultipleSources({ ...input, cursor: batch.nextCursor, knownResults: results });
    results = [...results, ...batch.results];
    hidden += batch.hiddenWithoutPlace;
    if (batch.warning) warnings.push(batch.warning);
  }
  return { first, last: batch, results, hidden, warnings };
}
