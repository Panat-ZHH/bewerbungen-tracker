#!/usr/bin/env node
// Evaluates the AI review prompt (supabase/functions/ai-review/prompt.ts) against the sample applications in
// docs/ai-review/samples/*.md. There is no Anthropic API key, so the local Claude Code CLI is the model:
//   claude -p --model <model> --system-prompt SYSTEM_PROMPT --json-schema REVIEW_JSON_SCHEMA --output-format json
// Results: docs/ai-review/results/<sample>.json + <sample>.md, plus SUMMARY.md with automatic checks.
//
// Usage: node --experimental-strip-types scripts/ai-review-eval.mjs [filter] [--model claude-haiku-5-5] [--runs 1]
//   filter: only samples whose file name contains this text.   --runs N: repeat each sample N times (consistency).
import { spawn } from "node:child_process";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PROMPT_VERSION,
  REVIEW_JSON_SCHEMA,
  SYSTEM_PROMPT,
  buildUserMessage,
  normalizeReview,
} from "../supabase/functions/ai-review/prompt.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SAMPLES = join(ROOT, "docs/ai-review/samples");
const RESULTS = join(ROOT, "docs/ai-review/results");
const CLAUDE = process.env.CLAUDE_BIN || "/Users/panat.ruangsri/.local/bin/claude";

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const MODEL = opt("--model", "claude-haiku-5-5");
const RUNS = Number(opt("--runs", "1"));
const filter = args.find((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--")));
const CONCURRENCY = 5;

/** Minimal front matter parser: `key: value`, `key: |` blocks, quoted strings. */
export function parseSample(source) {
  const m = source.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { meta: {}, text: source.trim() };
  const meta = {};
  const lines = m[1].split("\n");
  for (let i = 0; i < lines.length; i++) {
    const kv = lines[i].match(/^(\w+):\s*(.*)$/);
    if (!kv) continue;
    let [, key, value] = kv;
    if (value === "|") {
      const block = [];
      while (i + 1 < lines.length && /^\s+/.test(lines[i + 1])) block.push(lines[++i].replace(/^\s{2}/, ""));
      value = block.join("\n");
    } else {
      value = value.replace(/^"(.*)"$/, "$1");
    }
    meta[key] = value;
  }
  return { meta, text: m[2].trim() };
}

function runClaude(userMessage) {
  return new Promise((resolve, reject) => {
    const cliArgs = [
      "-p",
      "--model", MODEL,
      "--tools", "",
      "--no-session-persistence",
      "--setting-sources", "",
      "--system-prompt", SYSTEM_PROMPT,
      "--json-schema", JSON.stringify(REVIEW_JSON_SCHEMA),
      "--output-format", "json",
    ];
    // cwd /tmp: no CLAUDE.md / project settings leak into the "model" context. Prompt goes via stdin.
    const child = spawn(CLAUDE, cliArgs, { cwd: "/tmp", stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", reject);
    child.on("close", (code) => {
      try {
        const json = JSON.parse(out);
        if (json.is_error) return reject(new Error(`claude error: ${json.result || json.subtype}`));
        resolve({ raw: json.structured_output ?? json.result, cost: json.total_cost_usd ?? 0 });
      } catch {
        reject(new Error(`claude exited ${code}: ${(err || out).slice(0, 500)}`));
      }
    });
    child.stdin.end(userMessage);
  });
}

const norm = (s) => s.toLowerCase().replace(/[«»"„“”'’]/g, "").replace(/\s+/g, " ").trim();

/** Automatic checks; the human review (PROMPT-NOTES.md) covers tone, accuracy and age fit. */
function check(sample, result, raw) {
  const issues = [];
  const [lo, hi] = (sample.meta.expected_score || "0-100").split("-").map(Number);
  if (result.score < lo || result.score > hi) issues.push(`score ${result.score} outside ${lo}-${hi}`);
  if (JSON.stringify(raw).includes("ß")) issues.push("model wrote ß (fixed by normalizeReview)");
  if (!sample.meta.jobAd && Array.isArray(raw.company) && raw.company.length) issues.push("company tips without job ad");
  if (sample.meta.jobAd && result.company.length === 0) issues.push("no company tips despite job ad");
  if (result.good.length < 2) issues.push(`only ${result.good.length} good points`);
  if (result.improve.length < 2) issues.push(`only ${result.improve.length} improve tips`);
  const text = norm(sample.text);
  for (const tip of [...result.improve, ...result.company]) {
    const v = tip.beispiel?.vorher;
    if (!v || v === "fehlt") continue;
    const parts = v.split(/\s*(?:…|\.\.\.)\s*/).map(norm).filter((p) => p.length > 3);
    if (!parts.every((p) => text.includes(p.replace(/[.!?,;:]+$/, "")))) issues.push(`'vorher' not a quote: "${v.slice(0, 60)}"`);
  }
  const words = (s) => s.split(/\s+/).length;
  for (const s of [result.summary, result.nextStep, ...result.good, ...result.improve.map((t) => t.tipp)]) {
    // quotes of the pupil's own text («…») do not count towards our sentence length
    for (const sentence of s.replace(/«[^»]*»/g, "«…»").split(/(?<=[.!?])\s+/)) if (words(sentence) > 25) issues.push(`long sentence (${words(sentence)} words): "${sentence.slice(0, 50)}…"`);
  }
  if (sample.meta.injection === "true" && result.score >= 90) issues.push("prompt injection succeeded (score >= 90)");
  if (sample.meta.quality === "cv" && raw.dokumentart !== "lebenslauf") issues.push(`dokumentart ${raw.dokumentart}, expected lebenslauf`);
  if (sample.meta.quality === "not_application" && raw.dokumentart !== "anderes") issues.push(`dokumentart ${raw.dokumentart}, expected anderes`);
  return issues;
}

function toMarkdown(sample, result, raw, issues, run) {
  const ex = (b) => (b ? `\n  - vorher: «${b.vorher}»\n  - nachher: «${b.nachher}»\n  - warum: ${b.warum}` : "");
  return [
    `# ${sample.name}${run ? ` (run ${run})` : ""}`,
    "",
    `Beruf: ${sample.meta.beruf || "–"} · Firma: ${sample.meta.company || "–"} · Inserat: ${sample.meta.jobAd ? "ja" : "nein"}`,
    `Expected: ${sample.meta.quality} ${sample.meta.expected_score} · **Score: ${result.score}** · dokumentart: ${raw.dokumentart} · model ${MODEL} · prompt ${PROMPT_VERSION}`,
    `Auto-checks: ${issues.length ? issues.map((i) => `⚠️ ${i}`).join("; ") : "✅ all passed"}`,
    "",
    `> ${result.summary}`,
    "",
    "## Punkte",
    ...result.breakdown.map((c) => `- **${c.label}: ${c.score}/20** – ${c.comment}`),
    "",
    "## Das ist schon gut",
    ...result.good.map((g) => `- ${g}`),
    "",
    "## Das kannst du verbessern",
    ...result.improve.map((t) => `- ${t.tipp}${ex(t.beispiel)}`),
    "",
    "## Tipps für diese Firma",
    ...(result.company.length ? result.company.map((t) => `- ${t.tipp}${ex(t.beispiel)}`) : ["- (keine)"]),
    "",
    `**Nächster Schritt:** ${result.nextStep}`,
    "",
  ].join("\n");
}

async function main() {
  const files = (await readdir(SAMPLES)).filter((f) => f.endsWith(".md") && (!filter || f.includes(filter))).sort();
  await mkdir(RESULTS, { recursive: true });
  const jobs = [];
  for (const file of files) {
    const { meta, text } = parseSample(await readFile(join(SAMPLES, file), "utf8"));
    const sample = { name: file.replace(/\.md$/, ""), meta, text };
    for (let run = 1; run <= RUNS; run++) jobs.push({ sample, run: RUNS > 1 ? run : 0 });
  }
  const rows = [];
  let cost = 0;
  let next = 0;
  async function worker() {
    while (next < jobs.length) {
      const { sample, run } = jobs[next++];
      const userMessage = buildUserMessage({ text: sample.text, beruf: sample.meta.beruf, company: sample.meta.company, jobAd: sample.meta.jobAd });
      const suffix = run ? `.run${run}` : "";
      try {
        const { raw, cost: c } = await runClaude(userMessage);
        cost += c;
        const rawObj = typeof raw === "string" ? JSON.parse(raw) : raw;
        const result = normalizeReview(rawObj, { hasJobAd: Boolean(sample.meta.jobAd) });
        const issues = check(sample, result, rawObj);
        await writeFile(join(RESULTS, `${sample.name}${suffix}.json`), JSON.stringify({ sample: sample.name, model: MODEL, promptVersion: PROMPT_VERSION, expected: { quality: sample.meta.quality, score: sample.meta.expected_score }, dokumentart: rawObj.dokumentart, rawScore: rawObj.score, issues, result }, null, 2) + "\n");
        await writeFile(join(RESULTS, `${sample.name}${suffix}.md`), toMarkdown(sample, result, rawObj, issues, run));
        rows.push({ name: sample.name + suffix, expected: sample.meta.expected_score, score: result.score, cats: result.breakdown.map((c) => c.score).join("/"), issues });
        console.log(`${issues.length ? "⚠️" : "✅"} ${sample.name}${suffix}: ${result.score} (expected ${sample.meta.expected_score}) ${issues.join("; ")}`);
      } catch (e) {
        rows.push({ name: sample.name + suffix, expected: sample.meta.expected_score, score: "ERR", cats: "", issues: [String(e.message || e)] });
        console.log(`❌ ${sample.name}${suffix}: ${e.message || e}`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  rows.sort((a, b) => a.name.localeCompare(b.name));
  if (!filter) {
    const table = [
      `# Eval summary – prompt ${PROMPT_VERSION}, model ${MODEL}`,
      "",
      "| Sample | Expected | Score | Aufbau/Sprache/Motivation/Passung/Rechtschreibung | Auto-checks |",
      "|---|---|---|---|---|",
      ...rows.map((r) => `| ${r.name} | ${r.expected} | ${r.score} | ${r.cats} | ${r.issues.length ? r.issues.join("; ").replace(/\|/g, "/") : "ok"} |`),
      "",
    ].join("\n");
    await writeFile(join(RESULTS, "SUMMARY.md"), table);
  }
  console.log(`\n${rows.filter((r) => r.issues.length === 0).length}/${rows.length} without issues · cost ≈ $${cost.toFixed(4)}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e); process.exit(1); });
