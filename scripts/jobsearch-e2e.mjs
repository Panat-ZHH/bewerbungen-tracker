// E2E for the job / Lehrstellen search (/search). /api/job-search is stubbed (scripts/lib/jobsearch-stub.mjs), Supabase is the in-memory mock.
// Hooked into scripts/e2e-all.mjs (flow "jobsearch"); run on its own with:  node scripts/jobsearch-e2e.mjs [--profile=mobile --theme=dark]
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { installJobsearchStub, TOTAL } from "./lib/jobsearch-stub.mjs";

/** Registers the "jobsearch" flows on the e2e-all harness. */
export function registerJobsearchFlows(flow, student) {
  flow("jobsearch", student({ apps: [] }), async (t) => {
    const { page } = t;
    const log = await installJobsearchStub(page);
    const box = () => page.getByRole("combobox", { name: "Beruf oder Stelle suchen" });
    const cards = () => page.locator('section[aria-label="Suchergebnisse"] ol > li');
    const count = async () => Number(((await page.locator("p[aria-live=polite] strong").first().innerText().catch(() => "")) || "NaN").trim());
    const search = async (q) => { await box().fill(q); await box().press("Enter"); }; // Enter: on mobile the suggestion list can cover the button
    // Filters live in the desktop sidebar or, on mobile, in a bottom sheet.
    const withFilters = async (fn) => {
      if (!t.mobile) return fn(page.getByRole("complementary", { name: "Filter" }));
      await page.getByRole("button", { name: /^Filter( \(\d+\))?$/ }).click();
      const dialog = page.getByRole("dialog", { name: "Filter" });
      await dialog.waitFor();
      await fn(dialog);
      await dialog.getByRole("button", { name: /Treffer anzeigen/ }).click();
      await dialog.waitFor({ state: "hidden" });
    };

    await t.visit("/search", { waitFor: () => box().waitFor() });
    t.check("empty start shows how-to hint", await t.text(/So geht die Suche/));
    t.check("kind tabs Lehrstelle / Praktikum / Job", (await page.getByRole("tab").allInnerTexts()).join("|").match(/Lehrstelle.*Praktikum.*Job/s) !== null);
    await page.keyboard.press("/");
    t.check('"/" focuses the search field', await box().evaluate((el) => el === document.activeElement));
    await box().fill("x"); await box().press("Enter");
    t.check("query shorter than 2 letters shows a hint", await t.text(/mindestens zwei Buchstaben/, 5000));

    // ---- search, results, count, highlight, sources
    await search("Informatiker");
    await cards().first().waitFor();
    const hits = await count();
    t.check("results appear; only listings matching the query (incl. synonyms) are shown", hits > 3 && hits < 25 && (await cards().count()) === Math.min(20, hits), `${hits} hits, ${await cards().count()} cards`);
    t.check("query is highlighted in titles", (await page.locator("section[aria-label='Suchergebnisse'] mark").count()) > 0);
    t.check("source badges listed", await page.getByRole("list", { name: "Durchsuchte Quellen" }).isVisible());
    t.check("API got query + kind", log[0]?.query === "Informatiker" && log[0]?.kind === "apprenticeship", JSON.stringify(log[0]));
    t.check("relevance: best hit first is an Informatiker", /Informatiker/.test(await cards().first().innerText()));
    await t.shot("results");

    // ---- URL sync
    t.check("URL carries the query", /[?&]q=Informatiker/.test(page.url()), page.url());

    // ---- a broad query: every stub listing matches ("Offene Stelle" snippet)
    await search("Stelle");
    await page.waitForFunction(() => /\b25\b/.test(document.querySelector("p[aria-live=polite]")?.textContent ?? ""), null, { timeout: 15000 }).catch(() => undefined);
    t.check("broad query shows the whole first page (25 hits, 20 cards)", (await count()) === 25 && (await cards().count()) === 20, `${await count()} / ${await cards().count()}`);

    // ---- filters + chips
    await withFilters(async (scope) => { await scope.getByRole("button", { name: /^ZH\b/ }).first().click(); });
    await page.waitForTimeout(300);
    const chip = page.getByRole("button", { name: "Filter entfernen: Kanton ZH" });
    t.check("canton filter creates a removable chip", await chip.isVisible());
    const zh = await count();
    t.check("canton ZH narrows the list", zh > 0 && zh < 25, String(zh));
    const locs = await cards().allInnerTexts();
    t.check("every visible card is in Zürich", locs.slice(0, 20).every((x) => /Zürich/.test(x)));
    t.check("URL has c=ZH", /[?&]c=ZH/.test(page.url()), page.url());
    await withFilters(async (scope) => { await scope.getByRole("button", { name: /^Praktikum\b/ }).first().click(); });
    await page.waitForTimeout(300);
    t.check("second filter adds a second chip", await page.getByRole("button", { name: /Filter entfernen: Praktikum/ }).isVisible());
    await chip.click();
    await page.waitForURL((u) => !/[?&]c=ZH/.test(u.search), { timeout: 4000 }).catch(() => undefined);
    t.check("removing a chip drops it and its URL param", !(await chip.count()) && !/[?&]c=ZH/.test(page.url()), page.url());
    await page.getByRole("button", { name: "Alle löschen" }).click();
    await page.waitForTimeout(300);
    t.check('"Alle löschen" clears all chips', (await page.getByRole("list", { name: "Aktive Filter" }).count()) === 0);
    t.check("count is back to all loaded hits (short filtered lists pull in further pages)", (await count()) >= 25, String(await count()));

    // ---- sort
    await page.getByLabel("Sortieren").selectOption("company");
    await page.waitForTimeout(300);
    t.check("sort by company A-Z puts Alpha first", /Alpha Informatik/.test(await cards().first().innerText()));
    await page.waitForURL(/[?&]so=company/, { timeout: 4000 }).catch(() => undefined);
    t.check("URL has so=company", /[?&]so=company/.test(page.url()), page.url());
    await page.getByLabel("Sortieren").selectOption("relevance");

    // ---- server-side filter forwarded + re-search hint
    await withFilters(async (scope) => { await scope.getByRole("button", { name: /^Letzte 7 Tage|^7 Tage/ }).first().click(); });
    t.check("widening/narrowing server filters keeps list consistent", (await count()) > 0);
    await page.getByRole("button", { name: "Alle löschen" }).click().catch(() => undefined);

    // ---- infinite scroll
    const before = log.length;
    for (let i = 0; i < 12 && (await cards().count()) < TOTAL; i++) { await page.locator("footer, section[aria-label='Suchergebnisse'] ol").last().scrollIntoViewIfNeeded().catch(() => undefined); await page.keyboard.press("End"); await page.waitForTimeout(700); }
    t.check("infinite scroll loads all pages", (await cards().count()) === TOTAL, String(await cards().count()));
    t.check("pages beyond the first were requested with a cursor", log.some((b) => b.cursor), `${log.length - before} requests since scroll start`);
    t.check("end-of-list message", await t.text(/Alle passenden Stellen/, 5000));
    await t.shot("scrolled");

    // ---- reload keeps shareable state (query + filters + sort)
    await withFilters(async (scope) => { await scope.getByRole("button", { name: /^BE\b/ }).first().click(); });
    await page.getByLabel("Sortieren").selectOption("newest");
    await page.waitForTimeout(300);
    const shared = page.url();
    const u = new URL(shared);
    await t.visit(u.pathname + u.search, { waitFor: () => cards().first().waitFor() });
    t.check("shared link restores the query and re-runs the search", (await box().inputValue()) === "Stelle" && (await cards().count()) > 0, await box().inputValue());
    t.check("shared link restores the filter chip", await page.getByRole("button", { name: "Filter entfernen: Kanton BE" }).isVisible());
    t.check("shared link restores the sort", (await page.getByLabel("Sortieren").inputValue()) === "newest");
    await page.getByRole("button", { name: "Alle löschen" }).click();

    // ---- presets
    await page.getByRole("button", { name: /^Gespeicherte Suchen/ }).click();
    const dlg = page.getByRole("dialog", { name: "Gespeicherte Suchen" });
    await dlg.getByLabel("Name der Suche").fill("Informatik Zürich");
    await dlg.getByRole("button", { name: "Speichern" }).click();
    await page.waitForTimeout(300);
    t.check("preset is listed", await dlg.getByText("Informatik Zürich").isVisible());
    await page.keyboard.press("Escape");
    await t.visit("/search", { waitFor: () => box().waitFor() });
    t.check("fresh /search is empty again", (await box().inputValue()) === "");
    await page.getByRole("button", { name: /^Gespeicherte Suchen \(1\)/ }).click();
    await page.getByRole("dialog", { name: "Gespeicherte Suchen" }).getByRole("button", { name: /Informatik Zürich/ }).first().click();
    t.check("applying a preset re-runs the search", await cards().first().waitFor().then(() => true, () => false) && (await box().inputValue()) === "Stelle");
    await page.getByRole("button", { name: /^Gespeicherte Suchen/ }).click();
    await page.getByRole("button", { name: "Informatik Zürich löschen" }).click();
    t.check("preset can be deleted", await t.text(/Noch nichts gespeichert/, 4000));
    await page.keyboard.press("Escape");

    // ---- recent searches + Esc
    await box().fill(""); await box().focus();
    t.check("recent searches are suggested", await page.getByRole("listbox", { name: "Letzte Suchen" }).isVisible());
    await page.keyboard.press("Escape");
    await box().fill("Kauf"); await page.keyboard.press("Escape"); await page.keyboard.press("Escape");
    t.check("Esc closes suggestions, second Esc clears the field", (await box().inputValue()) === "");

    // ---- empty and error states
    await search("zzzz");
    t.check("empty state with a helpful message", await t.text(/Keine passenden Anzeigen gefunden/));
    await t.shot("empty");
    t.expect(/HTTP 500/, /Failed to load resource/, /error/i);
    await search("fehler");
    t.check("error state shows the server message", await t.text(/Stellenbörsen sind gerade nicht erreichbar/));
    await t.shot("error");
    await search("Kaufmann");
    t.check("search recovers after an error", await cards().first().waitFor().then(() => true, () => false));
  });
}

// standalone: delegate to the shared runner
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const run = spawnSync(process.execPath, [join(dirname(fileURLToPath(import.meta.url)), "e2e-all.mjs"), "--flow=jobsearch", ...process.argv.slice(2)], { stdio: "inherit" });
  process.exit(run.status ?? 1);
}
