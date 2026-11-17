// Security re-audit 2026-11-17 (branch reaudit1-sec): DB-level regressions on PGlite with all migrations applied.
import assert from "node:assert/strict";
import { test } from "node:test";
import { setupTeacherDb, ids } from "./helpers/teacher-db.mjs";

test("cvs.storage_path must stay inside the owner's own folder (service role deletes recorded paths)", async () => {
  const db = await setupTeacherDb();
  const { as, rpc, code, admin } = db;
  await as(ids.s1);
  const own = `${ids.s1}/doc-${ids.s1}-abc-1234/Lebenslauf.pdf`;
  await rpc("insert into public.cvs (id, user_id, name, type, description, updated_at, status, storage_path) values ('d1', $1, 'CV', 'other', '', current_date, 'Ready', $2)", [ids.s1, own]);
  await rpc("insert into public.cvs (id, user_id, name, type, description, updated_at, status) values ('d2', $1, 'Text', 'other', '', current_date, 'Ready')", [ids.s1]);
  for (const bad of [`${ids.s2}/doc-x/victim.pdf`, `${ids.s1}/../${ids.s2}/x.pdf`, `${ids.s1}`, `${ids.s1}//x.pdf`, `/${ids.s2}/x.pdf`, `${ids.s1}/./x`, `${ids.s1}/a\\..\\b`]) {
    assert.match(await code(rpc("update public.cvs set storage_path = $1 where id = 'd1'", [bad])) ?? "accepted", /cvs_storage_path_own_folder/, bad);
    assert.match(await code(rpc("insert into public.cvs (id, user_id, name, type, description, updated_at, status, storage_path) values ('d3', $1, 'x', 'other', '', current_date, 'Ready', $2)", [ids.s1, bad])) ?? "accepted", /cvs_storage_path_own_folder/, bad);
  }
  // legit values still work
  assert.equal(await code(rpc("update public.cvs set storage_path = $1 where id = 'd1'", [`${ids.s1}/doc-${ids.s1}-zz/Zeugnis 2026 (final).pdf`])), null);
  assert.equal(await code(rpc("update public.cvs set storage_path = null where id = 'd2'")), null);
  const [{ n }] = await admin("select count(*)::int n from public.cvs where user_id = $1", [ids.s1]);
  assert.equal(n, 2);
  // idempotent
  await db.apply("20261117130000_cvs_storage_path_guard.sql");
});
