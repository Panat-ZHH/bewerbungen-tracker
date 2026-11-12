import assert from "node:assert/strict";
import { test } from "node:test";
import { allLocalities, baseName, cantonsWithin, distanceKm, geocode, localitiesWithin, locateListing, placeKey, placeNamesWithin, samePlace, splitCompanyPlace, suggestPlaces, withinRadius } from "../lib/geo/places.ts";
import { CANTON_CODES, cantonFromName, cantonInText } from "../lib/geo/cantons.ts";
import { plzToCanton, resolveLocation } from "../lib/job-filters/geo.ts";
import { splitPlace } from "../lib/job-query-parse.ts";

const place = (text, options) => geocode(text, options)?.locality;
const named = (text, options) => { const found = place(text, options); return found ? `${found.plz} ${found.name} ${found.canton}` : undefined; };
const km = (from, to) => distanceKm(place(from), place(to));

test("directory: every Swiss locality with postcode, canton and plausible coordinates", () => {
  const all = allLocalities();
  assert.ok(all.length > 3900 && all.length < 5000, `${all.length} localities`);
  for (const locality of all) {
    assert.match(locality.plz, /^\d{4}$/);
    assert.ok(CANTON_CODES.includes(locality.canton) || locality.canton === "FL", locality.canton);
    assert.ok(locality.lat > 45.7 && locality.lat < 47.9 && locality.lon > 5.9 && locality.lon < 10.6, `${locality.name} ${locality.lat} ${locality.lon}`);
  }
  // the places of the bug report were missing in the old hand-typed table
  for (const name of ["Dübendorf", "Fehraltorf", "Volketswil", "Mönchaltorf", "Glattbrugg", "Andelfingen", "Uster", "Winterthur"]) assert.equal(place(name)?.canton, "ZH", name);
  assert.deepEqual([...new Set(all.map((locality) => locality.canton))].filter((code) => code !== "FL").sort(), [...CANTON_CODES].sort());
});

test("coordinates are right: known distances (LV95 -> WGS84 conversion)", () => {
  assert.ok(Math.abs(place("Winterthur").lat - 47.50) < 0.01 && Math.abs(place("Winterthur").lon - 8.73) < 0.01);
  assert.ok(Math.abs(km("Zürich", "Bern") - 95) < 4, String(km("Zürich", "Bern")));
  assert.ok(Math.abs(km("Winterthur", "Zürich") - 20) < 1.5);
  assert.ok(Math.abs(km("Winterthur", "Dübendorf") - 14) < 1);
  assert.ok(Math.abs(km("Winterthur", "Uster") - 17) < 1);
  assert.equal(km("Uster", "Uster"), 0);
});

test("normalisation: postcode + place, slashes, brackets, canton codes, fillers, spellings", () => {
  assert.equal(named("8610 Uster"), "8610 Uster ZH");
  assert.equal(named("CH-8400 Winterthur"), "8400 Winterthur ZH");
  assert.equal(named("Rothenburg / Luzern"), "6023 Rothenburg LU");
  assert.equal(named("Glattpark (Zürich)"), "8152 Glattpark (Opfikon) ZH");
  assert.equal(named("Glattpark (Opfikon)"), "8152 Glattpark (Opfikon) ZH");
  assert.equal(named("Winterthur ZH"), "8400 Winterthur ZH");
  assert.equal(named("  Winterthur,  Schweiz "), "8400 Winterthur ZH");
  assert.equal(named("Region Basel"), "4001 Basel BS");
  assert.equal(named("Raum Zürich"), "8001 Zürich ZH");
  assert.equal(named("Zürich Oerlikon"), "8001 Zürich ZH");
  assert.equal(geocode("Zürich Oerlikon").precision, "partial");
  assert.equal(named("Zuerich"), "8001 Zürich ZH");
  assert.equal(named("ZÜRICH"), "8001 Zürich ZH");
  for (const spelling of ["St. Gallen", "St.Gallen", "Sankt Gallen", "St Gallen"]) assert.equal(named(spelling), "9000 St. Gallen SG", spelling);
  assert.equal(named("Genf"), named("Genève"));
  assert.equal(named("Biel"), named("Biel/Bienne"));
  assert.equal(named("Neuenburg"), named("Neuchâtel"));
  // municipality names that are no locality of their own
  assert.equal(place("Illnau-Effretikon").canton, "ZH");
  assert.equal(place("Rapperswil-Jona").canton, "SG");
  // not a place
  for (const text of ["", "   ", "Schweiz", "Homeoffice", "ganze Schweiz", "Aargau", "diverse Standorte", undefined]) assert.equal(geocode(text), undefined, String(text));
  assert.equal(placeKey("St. Gallen"), placeKey("Sankt  Gallen"));
  assert.equal(baseName("Glattpark (Opfikon)"), "Glattpark");
  assert.equal(baseName("Buchs AG"), "Buchs");
});

test("postcode: wins over the name, unknown PO-box postcodes fall back sensibly", () => {
  assert.equal(named("8450"), "8450 Andelfingen ZH");
  assert.equal(geocode("8450").label, "8450 Andelfingen");
  assert.equal(geocode("8450").precision, "plz");
  assert.equal(named("5033 Buchs"), "5033 Buchs AG AG");
  assert.equal(named("9470 Buchs"), "9470 Buchs SG SG");
  assert.equal(named("8152 Glattpark"), "8152 Glattpark (Opfikon) ZH");
  assert.equal(named("8000 Zürich"), "8001 Zürich ZH");
  assert.equal(place("3000 Bern").canton, "BE");
  assert.equal(place("8000").canton, "ZH");
});

test("ambiguous names: canton in the text > soft canton hint > preferred list (largest / most likely place)", () => {
  assert.equal(named("Buchs AG"), "5033 Buchs AG AG");
  assert.equal(named("Buchs (ZH)"), "8107 Buchs ZH ZH");
  assert.equal(named("Buchs, SG"), "9470 Buchs SG SG");
  assert.equal(named("Buchs"), "9470 Buchs SG SG");
  assert.equal(named("Buchs", { preferCanton: "ZH" }), "8107 Buchs ZH ZH");
  assert.equal(named("Buchs", { canton: "LU" }), "6211 Buchs LU LU");
  assert.equal(named("Wil"), "9500 Wil SG SG");
  assert.equal(named("Wil ZH"), "8196 Wil ZH ZH");
  assert.equal(named("Pfäffikon"), "8330 Pfäffikon ZH ZH");
  assert.equal(named("Pfäffikon SZ"), "8808 Pfäffikon SZ SZ");
  assert.equal(named("Wetzikon"), "8620 Wetzikon ZH ZH");
  // a canton hint that fits no candidate is ignored instead of losing the place
  assert.equal(named("Winterthur", { canton: "BE" }), "8400 Winterthur ZH");
  // a plain name wins over a name that only contains it: Baar is Baar ZG, not Baar (Nendaz)
  assert.equal(named("Baar"), "6340 Baar ZG");
});

test("typos are only forgiven for what the user types, never for listings", () => {
  assert.equal(geocode("Wintertur"), undefined);
  assert.equal(named("Wintertur", { fuzzy: true }), "8400 Winterthur ZH");
  assert.equal(geocode("Wintertur", { fuzzy: true }).precision, "fuzzy");
  assert.equal(geocode("Xyzabc", { fuzzy: true }), undefined);
});

test("radius rule: 'Nur dieser Ort' is the municipality, otherwise the distance between the localities", () => {
  const uster = place("Uster"), winterthur = place("Winterthur");
  assert.ok(samePlace(uster, place("8610 Uster")));
  assert.ok(samePlace(uster, place("Nänikon")), "Nänikon belongs to Uster");
  assert.ok(samePlace(winterthur, place("8404 Winterthur")));
  assert.ok(!samePlace(uster, place("Volketswil")));
  assert.ok(withinRadius(uster, place("Nänikon"), 0));
  assert.ok(!withinRadius(uster, place("Volketswil"), 0));
  assert.ok(!withinRadius(uster, place("Volketswil"), 5) && withinRadius(uster, place("Volketswil"), 10));
  assert.ok(withinRadius(winterthur, place("Seuzach"), 5));
  assert.ok(!withinRadius(winterthur, place("Dübendorf"), 10) && withinRadius(winterthur, place("Dübendorf"), 20));
  assert.ok(!withinRadius(winterthur, place("Zürich"), 10));
  const near = localitiesWithin(winterthur, 10);
  assert.ok(near.every((entry) => entry.km <= 10 || samePlace(winterthur, entry.locality)) && near.every((entry, index) => index === 0 || near[index - 1].km <= entry.km));
  assert.deepEqual(cantonsWithin(winterthur, 10), ["ZH", "TG"]);
  assert.deepEqual(cantonsWithin(uster, 0), ["ZH"]);
  assert.deepEqual(cantonsWithin(place("8450"), 20).slice(0, 3), ["ZH", "TG", "SH"]);
  const names = placeNamesWithin(winterthur, 10);
  assert.equal(names[0], "Winterthur");
  assert.ok(names.includes("Seuzach") && !names.includes("Zürich") && !names.includes("Uster"));
  assert.equal(new Set(names).size, names.length);
  assert.deepEqual(placeNamesWithin(uster, 0).slice(0, 1), ["Uster"]);
  assert.ok(placeNamesWithin(uster, 0).includes("Nänikon") && !placeNamesWithin(uster, 0).includes("Volketswil"));
});

test("a place that slipped into the company name is recovered; ordinary company names stay untouched", () => {
  assert.deepEqual(splitCompanyPlace("Loomis Schweiz AG Kloten"), { company: "Loomis Schweiz AG", place: "Kloten" });
  assert.deepEqual(splitCompanyPlace("Muster GmbH, Uster"), { company: "Muster GmbH", place: "Uster" });
  assert.deepEqual(splitCompanyPlace("Beispiel AG (Zug)"), { company: "Beispiel AG", place: "Zug" });
  for (const company of ["Zürcher Kantonalbank", "Bank Linth", "Kantonsspital Glarus AG", "SV (Schweiz) AG", "Müller AG Bau", "", undefined]) assert.equal(splitCompanyPlace(company), undefined, String(company));
  const loomis = locateListing({ title: "Lehrstelle Informatiker/in EFZ", company: "Loomis Schweiz AG Kloten" });
  assert.deepEqual([loomis.job.company, loomis.job.location, loomis.job.canton, loomis.match.locality.name], ["Loomis Schweiz AG", "Kloten", "ZH", "Kloten"]);
  // a listing that has a place keeps its company name as it is
  const bosch = locateListing({ title: "x", company: "Bosch Group – Scintilla AG St. Niklaus", location: "St. Niklaus", canton: "VS" }, { canton: "VS" });
  assert.deepEqual([bosch.job.company, bosch.job.location, bosch.job.canton], ["Bosch Group – Scintilla AG St. Niklaus", "St. Niklaus", "VS"]);
  // canton comes from the directory; unknown places keep what the source said
  assert.equal(locateListing({ title: "x", location: "  Rothenburg /  Luzern " }).job.canton, "LU");
  assert.equal(locateListing({ title: "x", location: "Rothenburg / Luzern" }).job.location, "Rothenburg / Luzern");
  assert.equal(locateListing({ title: "x", location: "Homeoffice", canton: "ZH" }).job.canton, "ZH");
  assert.equal(locateListing({ title: "x", location: "Homeoffice" }).match, undefined);
  assert.deepEqual(locateListing({ title: "x" }).job, { title: "x" });
});

test("autocomplete: Ortschaft · PLZ · Kanton, by name prefix (accent tolerant) or postcode", () => {
  const winti = suggestPlaces("wint");
  assert.deepEqual(winti[0], { name: "Winterthur", plz: "8400", canton: "ZH", label: "Winterthur · 8400 · ZH", value: "Winterthur" });
  assert.ok(winti.length <= 8);
  assert.equal(suggestPlaces("zuri")[0].name, "Zürich");
  assert.equal(suggestPlaces("Zür")[0].name, "Zürich");
  assert.equal(suggestPlaces("genf")[0].name, "Genève");
  assert.equal(suggestPlaces("st. ga")[0].name, "St. Gallen");
  assert.deepEqual(suggestPlaces("buchs").filter((s) => /^Buchs/.test(s.name)).map((s) => s.canton).sort(), ["AG", "LU", "SG", "ZH"]);
  const byPlz = suggestPlaces("8450");
  assert.deepEqual(byPlz.map((s) => s.label), ["Andelfingen · 8450 · ZH"]);
  assert.equal(byPlz[0].value, "8450 Andelfingen");
  assert.ok(suggestPlaces("84").every((s) => s.plz.startsWith("84")));
  assert.deepEqual(suggestPlaces("8610 us").map((s) => s.name), ["Uster"]);
  assert.deepEqual(suggestPlaces("w"), []);
  assert.deepEqual(suggestPlaces("qqqqq"), []);
  // every suggestion resolves back to exactly the suggested place
  for (const query of ["wint", "buchs", "wil", "84", "pfäff", "st", "aesch", "rapperswil"]) {
    for (const s of suggestPlaces(query)) {
      const back = geocode(s.value);
      assert.ok(back && back.canton === s.canton && samePlace(back.locality, place(`${s.plz} ${s.name}`)), `${query}: ${s.value}`);
    }
  }
});

test("one resolver for the main search text and the Ort filter", () => {
  assert.deepEqual(splitPlace("Informatiker Zürich"), { query: "Informatiker", location: "Zürich" });
  assert.deepEqual(splitPlace("Informatiker Fehraltorf"), { query: "Informatiker", location: "Fehraltorf" });
  assert.deepEqual(splitPlace("Kauffrau in Winterthur"), { query: "Kauffrau", location: "Winterthur" });
  assert.deepEqual(splitPlace("Informatiker 8610 Uster"), { query: "Informatiker", location: "8610 Uster" });
  assert.deepEqual(splitPlace("Informatiker St. Gallen"), { query: "Informatiker", location: "St. Gallen" });
  assert.deepEqual(splitPlace("Informatiker Buchs AG"), { query: "Informatiker", location: "Buchs AG" });
  assert.deepEqual(splitPlace("Kaufmann EFZ Bad Ragaz"), { query: "Kaufmann EFZ", location: "Bad Ragaz" });
  // whatever the text parser calls a place, the filter resolver resolves – and the other way round
  for (const text of ["Informatiker Zürich", "Informatiker 8450", "Koch in Wald", "Informatiker Glattpark"]) assert.ok(geocode(splitPlace(text).location), text);
  // professions and everyday words are no places
  for (const text of ["Informatiker", "Fachmann Gesundheit", "Zürich", "Informatiker Applikationsentwicklung", "Koch Wald", "Informatiker Lohn", "Kaufmann Bank", "Zeichner Hochbau"]) assert.deepEqual(splitPlace(text), { query: text, location: "" }, text);
  assert.deepEqual(splitPlace("Koch in Wald"), { query: "Koch", location: "Wald" });
  // a canton instead of a place
  assert.deepEqual(splitPlace("Informatiker Aargau"), { query: "Informatiker", location: "", canton: "AG" });
  assert.deepEqual(splitPlace("Informatiker Kanton Zürich"), { query: "Informatiker", location: "", canton: "ZH" });
});

test("earlier helpers keep working on top of the directory (canton lookup for existing callers)", () => {
  assert.equal(plzToCanton("8001"), "ZH");
  assert.equal(plzToCanton(8450), "ZH");
  assert.equal(plzToCanton("abc"), undefined);
  assert.deepEqual([resolveLocation("Fehraltorf").canton, resolveLocation("Fehraltorf").city], ["ZH", "fehraltorf"]);
  assert.equal(resolveLocation("Kanton Waadt").canton, "VD");
  assert.equal(resolveLocation("irgendwo"), undefined);
  assert.equal(cantonFromName("Waadt"), "VD");
  assert.equal(cantonFromName("Winterthur"), undefined);
  assert.equal(cantonInText("Winterthur ZH"), "ZH");
  assert.equal(cantonInText("Winterthur"), undefined);
});
