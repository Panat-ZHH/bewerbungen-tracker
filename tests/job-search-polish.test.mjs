import test from "node:test";
import assert from "node:assert/strict";
import { splitPlace } from "../lib/job-query-parse.ts";
import { cardFacts, applicationExtras, formatIsoDate } from "../lib/job-card-info.ts";

test("splitPlace takes a trailing city off the query", () => {
  assert.deepEqual(splitPlace("Informatiker Zürich"), { query: "Informatiker", location: "Zürich" });
  assert.deepEqual(splitPlace("Kauffrau in Winterthur"), { query: "Kauffrau", location: "Winterthur" });
  assert.deepEqual(splitPlace("Informatiker 8001"), { query: "Informatiker", location: "8001" });
});
test("splitPlace leaves plain professions alone", () => {
  assert.deepEqual(splitPlace("Informatiker"), { query: "Informatiker", location: "" });
  assert.deepEqual(splitPlace("Fachmann Gesundheit"), { query: "Fachmann Gesundheit", location: "" });
  assert.equal(splitPlace("Zürich").location, "");
});
test("cardFacts reads explicit fields and snippet hints only when present", () => {
  assert.deepEqual(cardFacts({ title: "x", url: "u", source: "s" }), {});
  const facts = cardFacts({ title: "x", url: "u", source: "s", startDate: "2027", snippet: "Bewerbungsfrist: 31.01.2027. Schnupperlehre möglich." });
  assert.equal(facts.start, "2027");
  assert.equal(facts.deadline, "2027-01-31");
  assert.equal(facts.schnupperlehre, true);
  assert.equal(formatIsoDate("2027-01-31"), "31.01.2027");
});
test("applicationExtras copies deadline, description and start", () => {
  const extras = applicationExtras({ title: "x", url: "u", source: "s", deadline: "2027-02-01", snippet: "Beschreibung", startDate: "2027" });
  assert.deepEqual(extras, { deadline: "2027-02-01", jobDescription: "Beschreibung", startNote: "Lehrbeginn: 2027" });
});
