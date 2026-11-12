// Deterministic stand-in for POST /api/job-search (nothing real is scraped). Shared by jobsearch-e2e and jobsearch-visual-qa.
// 60 listings, served 25 per request (cursor pages 1..3). Magic queries: "zzzz" -> no hits, "fehler" -> HTTP 500.
// With a place (body.location) the answer carries `place` and every listing a `distanceKm` (the first of each four is "in the place"),
// like the real API; location "nirgendwo" -> HTTP 422 unknown place.
const TITLES = ["Informatiker/in EFZ", "Kaufmann/-frau EFZ", "Detailhandelsfachmann/-frau EFZ", "Polymechaniker/in EFZ", "Praktikum Marketing", "Software Engineer 80-100%"];
const COMPANIES = ["Zeta Versicherungen AG", "Alpha Informatik AG", "Mitte Bank AG", "Berner Spital AG", "Basler Logistik GmbH", "Luzerner Handel AG"];
const PLACES = [["8001 Zürich", "ZH"], ["3011 Bern", "BE"], ["4001 Basel", "BS"], ["6003 Luzern", "LU"]];
const SOURCES = ["Yousty", "jobs.ch", "jobup.ch"];
const DAY = 864e5;

export const TOTAL = 60;
export const PAGE = 25;
export function makeJobs(total = TOTAL) {
  return Array.from({ length: total }, (_, i) => {
    const [location, canton] = PLACES[i % 4];
    const title = TITLES[i % TITLES.length];
    const praktikum = /Praktikum/.test(title);
    const lehre = /EFZ/.test(title);
    const job = {
      title: `${title}${i >= 6 ? ` (${i})` : ""}`, company: COMPANIES[i % COMPANIES.length], location, canton,
      url: `https://www.yousty.ch/de-CH/lehrstellen/profile/${1000 + i}-stub`, source: SOURCES[i % 3],
      jobType: praktikum ? "praktikum" : lehre ? "lehrstelle" : "vollzeit",
      postedAt: new Date(Date.now() - (i % 20) * DAY).toISOString().slice(0, 10),
      snippet: `Du unterstützt unser Team in ${location.replace(/^\d+ /, "")}. Offene Stelle mit spannenden Aufgaben und einem tollen Umfeld.`,
    };
    if (lehre) { job.education = "efz"; job.years = [String(new Date().getFullYear() + 1)]; }
    if (!lehre && !praktikum) { job.workloadMin = 80; job.workloadMax = 100; }
    return job;
  });
}

/** Installs the stub on a Playwright context/page. `log` collects every request body. */
export async function installJobsearchStub(target, { log = [], jobs = makeJobs(), delay = 0 } = {}) {
  await target.route("**/api/job-search", async (route) => {
    const body = JSON.parse(route.request().postData() || "{}");
    log.push(body);
    if (delay) await new Promise((r) => setTimeout(r, delay));
    const q = String(body.query || "").toLowerCase();
    const json = (status, data) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });
    if (q.includes("fehler")) return json(500, { error: "Die Stellenbörsen sind gerade nicht erreichbar." });
    const location = String(body.location || "").trim();
    if (/nirgendwo/i.test(location)) return json(422, { error: `Den Ort „${location}“ kennen wir leider nicht. Wähle einen Vorschlag aus der Liste oder gib eine Postleitzahl ein.`, code: "unknown_place" });
    const place = location ? { label: location, name: location, plz: "8400", canton: "ZH", lat: 47.5, lon: 8.72, radiusKm: body.filters?.radiusKm ?? 10, fromQuery: false } : null;
    const shape = { query: body.query, location, place, hiddenWithoutPlace: 0 };
    if (q.includes("zzzz")) return json(200, { ...shape, results: [], updates: [], nextCursor: null, sources: [{ name: "Yousty", status: "ok", count: 0 }], complete: true });
    const page = body.cursor?.yousty?.page ?? body.cursor?.jobs?.page ?? 1;
    const start = (page - 1) * PAGE;
    const slice = jobs.slice(start, page * PAGE).map((job, index) => (place ? { ...job, distanceKm: (start + index) % 4 === 0 ? 0 : ((start + index) % 9) + 0.5, ...((start + index) % 4 === 0 ? { inPlace: true } : {}) } : job));
    const more = page * PAGE < jobs.length;
    return json(200, {
      ...shape, hiddenWithoutPlace: place && page === 1 ? 3 : 0,
      results: slice, updates: [], complete: !more,
      nextCursor: more ? { yousty: { page: page + 1, offset: 0 }, jobs: { page: page + 1, offset: 0 }, jobup: null } : null,
      sources: [{ name: "Yousty", status: "ok", count: slice.length }, { name: "jobs.ch", status: "ok", count: slice.length }],
    });
  });
  return log;
}
