import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { statusLabels } from "../lib/utils.ts";

test("status 'offer' is labelled Zusage; stored value unchanged", () => {
  assert.equal(statusLabels.offer, "Zusage");
});

test("no user-facing 'Angebot' label is left in app/components/lib", async () => {
  for (const f of ["lib/utils.ts", "app/map/page.tsx", "app/dashboard/page.tsx", "app/analytics/page.tsx", "components/classes/class-detail.tsx"]) {
    assert.doesNotMatch(await readFile(f, "utf8"), /Angebot/, f);
  }
});
