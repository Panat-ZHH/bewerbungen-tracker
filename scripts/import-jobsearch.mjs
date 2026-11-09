#!/usr/bin/env node
// Imports the job list from the Obsidian note into `applications` of ONE user (idempotent by user_id + job_url).
// Usage: node scripts/import-jobsearch.mjs [--email test.panat@gmail.com] [--note <path>] [--dry-run]
// Needs the Supabase CLI helper (token stays in ~/.config/alfred, never printed): /Users/panat.ruangsri/JARVIS/bin/sb privat
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const email = arg("--email", "test.panat@gmail.com").toLowerCase();
const note = arg("--note", join(homedir(), "Documents/Alfred/Projekte/Jobsuche Grosse Firmen.md"));
const dry = process.argv.includes("--dry-run");
const SB = arg("--sb", join(homedir(), "JARVIS/bin/sb"));
const DATE = "2026-11-06";
const SECTOR = { 1: "Finanz", 2: "Software", 3: "Finanz, Software", 4: "Finanz, Software", 5: "Finanz, Software", 6: "Software", 7: "Rüstung", 8: "Rüstung", 9: "Rüstung", 10: "Rüstung", 11: "Software", 12: "Software", 13: "Software", 14: "Finanz", 15: "Software", 16: "Rüstung", 17: "Rüstung", 18: "Software", 19: "Software", 20: "Software", 21: "Finanz", 22: "Finanz", 23: "Finanz", 24: "Finanz" };
const BANKING = new Set([14, 21, 22]);
const SCORE = { A: 85, B: 60, C: 35 }; // match_score used as priority: A high, B medium, C low

const rows = [];
for (const line of readFileSync(note, "utf8").split("\n")) {
  const c = line.split(/(?<!\\)\|/).map((s) => s.trim());
  if (!/^\d+$/.test(c[1] ?? "") || c.length < 10) continue;
  const n = Number(c[1]);
  const url = (c[8].match(/\((https?:[^)]+)\)/) ?? [])[1];
  if (!url) continue;
  const company = c[2].replace(/\s*\(Finanz\)/, "").replace(/\\\|/g, "|");
  const grade = c[5];
  const sector = SECTOR[n] ?? "Software";
  const category = sector.startsWith("Rüstung") ? "other" : sector === "Software" ? "software" : BANKING.has(n) ? "banking" : "finance";
  const position = c[3].replace(/\s*\((teilweise geprüft|nur Drittseite gesehen)\)/, "");
  const checked = /teilweise geprüft|nur Drittseite/.test(c[3]) ? " (Link nur teilweise geprüft)" : "";
  rows.push({
    n, company, position, location: c[4], url, category,
    score: SCORE[grade[0]] ?? 35,
    notes: [`Eignung: ${grade}`, `Sektor: ${sector}`, `Warum / Anforderungen: ${c[6]}${checked}`, `Citizenship / Clearance: ${c[7]}`, "Frist: keine angegeben (rollierend)", `Quelle: Jobsuche ${DATE}`, "Noch nicht beworben."].join("\n"),
  });
}
if (rows.length !== 24) throw new Error(`expected 24 positions, parsed ${rows.length}`);
if (dry) { console.log(JSON.stringify(rows.slice(0, 2), null, 1), `\n${rows.length} rows parsed`); process.exit(0); }

const tag = "$js" + Math.random().toString(36).slice(2, 8) + "$";
const json = JSON.stringify(rows);
if (json.includes(tag)) throw new Error("tag clash");
const sql = `
with u as (select id from auth.users where lower(email) = '${email.replace(/'/g, "''")}'),
src as (select * from jsonb_to_recordset(${tag}${json}${tag}::jsonb) as x(n int, company text, position text, location text, url text, category text, score numeric, notes text)),
ins as (
  insert into public.applications (id, user_id, company, position, location, job_url, source, category, status, match_score, created_at, updated_at, notes)
  select u.id::text || '-job-' || substr(md5(src.url), 1, 12), u.id, src.company, src.position, src.location, src.url, 'Jobsuche ${DATE}', src.category, 'saved', src.score, current_date, current_date, src.notes
  from u cross join src
  where not exists (select 1 from public.applications a where a.user_id = u.id and a.job_url = src.url)
  on conflict (id) do nothing
  returning 1)
select (select count(*) from u) as user_found, (select count(*) from ins) as inserted,
       (select count(*) from public.applications a, u where a.user_id = u.id and a.source = 'Jobsuche ${DATE}') as total_for_user;`;
const out = execFileSync(SB, ["privat", "db", "query", "--linked", sql], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
console.log(out.match(/"rows"[\s\S]*?\]/)?.[0] ?? out);
