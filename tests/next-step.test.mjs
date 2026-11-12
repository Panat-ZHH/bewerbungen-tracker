import assert from "node:assert/strict";
import { test } from "node:test";
import { firstName, furthestStage, nextStep, pathCounts } from "../lib/next-step.ts";

const app = (id, status, extra = {}) => ({ id, company: `Firma ${id}`, status, ...extra });

test("nextStep: new users are invited to the first application", () => {
  assert.deepEqual(nextStep([], "2026-11-11"), { text: "Bereit für deine erste Bewerbung?", href: "/applications/new", cta: "Erste Bewerbung eintragen" });
});

test("nextStep picks exactly one step by urgency", () => {
  assert.match(nextStep([app("a", "applied"), app("b", "applied")], "2026-11-11").text, /^2 Bewerbungen warten auf Antwort\.$/);
  assert.match(nextStep([app("a", "applied")], "2026-11-11").text, /^1 Bewerbung wartet auf Antwort\.$/);
  const talk = nextStep([app("a", "applied"), app("b", "interview")], "2026-11-11");
  assert.match(talk.text, /Gespräch bei Firma b/);
  assert.equal(talk.href, "/applications/b");
  const due = nextStep([app("a", "applied"), app("c", "saved", { deadline: "2026-11-12" })], "2026-11-11");
  assert.match(due.text, /Firma c: Bewerben bis morgen/);
  assert.match(nextStep([app("c", "saved", { deadline: "2026-12-24" })], "2026-11-11").text, /1 gemerkte Stelle wartet auf dich/);
  assert.match(nextStep([app("a", "rejected")], "2026-11-11").text, /nächste Stelle/);
});

test("nextStep uses Swiss spelling (no ß)", () => {
  const cases = [[], [app("a", "saved")], [app("a", "preparing")], [app("a", "applied")], [app("a", "interview")], [app("a", "offer")], [app("a", "schnupper_planned")], [app("a", "contract_signed")], [app("a", "withdrawn")]];
  for (const list of cases) assert.doesNotMatch(nextStep(list, "2026-11-11").text, /ß/);
});

test("pathCounts groups statuses into Gemerkt → Abgeschickt → Gespräch → Zusage", () => {
  const counts = pathCounts([app(1, "saved"), app(2, "preparing"), app(3, "applied"), app(4, "aptitude_test"), app(5, "interview"), app(6, "offer"), app(7, "rejected"), app(8, "withdrawn")]);
  assert.deepEqual(counts, { saved: 2, sent: 2, talk: 1, placed: 1, rejected: 1, total: 8 });
  assert.equal(furthestStage(counts), "placed");
  assert.equal(furthestStage(pathCounts([app(1, "saved")])), "saved");
  assert.equal(furthestStage(pathCounts([app(1, "rejected")])), null);
});

test("firstName never shows an e-mail or placeholder", () => {
  assert.equal(firstName("Panat Ruangsri"), "Panat");
  assert.equal(firstName("lena@example.com"), "");
  assert.equal(firstName("Nutzer"), "");
  assert.equal(firstName(""), "");
});
