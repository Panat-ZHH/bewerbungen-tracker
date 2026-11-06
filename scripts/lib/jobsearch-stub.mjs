// Deterministic stand-in for POST /api/job-search (nothing real is scraped). Shared by jobsearch-e2e and jobsearch-visual-qa.
// 60 listings, served 25 per request (cursor pages 1..3). Magic queries: "zzzz" -> no hits, "fehler" -> HTTP 500.
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
    if (q.includes("zzzz")) return json(200, { results: [], updates: [], nextCursor: null, sources: [{ name: "Yousty", status: "ok", count: 0 }], complete: true });
    const page = body.cursor?.yousty?.page ?? body.cursor?.jobs?.page ?? 1;
    const slice = jobs.slice((page - 1) * PAGE, page * PAGE);
    const more = page * PAGE < jobs.length;
    return json(200, {
      results: slice, updates: [], complete: !more,
      nextCursor: more ? { yousty: { page: page + 1, offset: 0 }, jobs: { page: page + 1, offset: 0 }, jobup: null } : null,
      sources: [{ name: "Yousty", status: "ok", count: slice.length }, { name: "jobs.ch", status: "ok", count: slice.length }],
    });
  });
  return log;
}
