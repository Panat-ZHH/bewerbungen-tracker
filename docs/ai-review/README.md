# AI application review ("Bewerbungs-Check")

A pupil uploads their application (PDF or DOCX) on `/bewerbung-check`, optionally with company, Beruf and job ad.
An AI returns a score 0–100 (5 categories × 0–20), strengths, improvements with before/after sentences to copy,
company tips and a next step. Swiss German, Du-Form. Reached from "Meine Dokumente" (`/cvs`), each application's
detail page (pre-filled via `?application=<id>`) and `/hilfe`.

## Architecture
- **UI** (Next.js): `app/bewerbung-check/`, `components/ai-review/*` (form, loading, result, history),
  `lib/ai-review.ts` (multipart POST to the edge function with the user's access token; list/delete past reviews
  via supabase-js), `lib/ai-review-core.ts` (pure helpers: validation, error texts, labels, preview sample).
- **Edge function** `supabase/functions/ai-review/` (Deno): `index.ts` wiring → `handler.ts` (auth → multipart →
  consent → limits → extract → model → `normalizeReview` → store result) · `extract.ts` (PDF via unpdf, DOCX via
  fflate, in memory only) · `anthropic.ts` (Messages API, structured JSON output, cached system prompt, one retry)
  · `prompt.ts` (system prompt, user message, JSON schema, `normalizeReview`) · `mock.ts` · `errors.ts` · `types.ts`
  (the contract shared by all parts).
- **Database** `supabase/migrations/20261112000000_ai_reviews.sql`: `ai_reviews` (only the result, never the file or
  its text) and `ai_review_user_settings` (optional `daily_limit`, `consent_at`). RLS: owner select/delete; inserts
  only by the service role; cascade on user deletion.
- **Privacy**: the file/text never leaves memory except to Anthropic; logs hold event codes, char count and score
  only. Consent is a required tick box per check (client) and `consent=true` (server, else 400).

## Environment variables
| Name | Where | Meaning |
|---|---|---|
| `ANTHROPIC_API_KEY` | Supabase secret | Anthropic key. Missing → server mock mode (`mock: true`). |
| `AI_REVIEW_MODEL` | Supabase secret | Optional, default `claude-haiku-5-5`. |
| `AI_REVIEW_MOCK` | Supabase secret | `1` forces mock mode even with a key. |
| `AI_REVIEW_DEFAULT_DAILY_LIMIT` | Supabase secret | Optional checks per user per 24 h. Unset = no limit (default). Per-user override: `ai_review_user_settings.daily_limit` (admin SQL). |
| `NEXT_PUBLIC_AI_REVIEW_MOCK` | Netlify / `.env.local` | `1` = the browser returns a built-in sample, no network (previews). |

## Go-live (each step needs Panat's approval – not done yet)
1. Get an API key: <https://console.anthropic.com> → Settings → API keys → Create key (add billing credit first).
2. Apply the migration (repo is linked to `bhwreehwirrloxagyypi`; check first with `--dry-run`):
   `/Users/panat.ruangsri/JARVIS/bin/sb privat db push --linked --dry-run`, then without `--dry-run`.
   Note: earlier migrations may also be listed as pending (see vault note of 2026-11-04) – review the list first.
3. Set the secret (type the key yourself, never paste it into chat):
   `/Users/panat.ruangsri/JARVIS/bin/sb privat secrets set ANTHROPIC_API_KEY=... --project-ref bhwreehwirrloxagyypi`
4. Deploy the function:
   `/Users/panat.ruangsri/JARVIS/bin/sb privat functions deploy ai-review --project-ref bhwreehwirrloxagyypi`
5. Do not set `NEXT_PUBLIC_AI_REVIEW_MOCK` in production. Smoke-test once with a real PDF and check the
   `ai_reviews` row and the function logs.

## Tests
- `npm test` – unit tests incl. `tests/ai-review-{backend,prompt,ui}.test.mjs` (387/387 pass at integration).
- `cd supabase/functions/ai-review && deno check *.ts && deno lint`.
- UI screenshots (mock mode): see `tests/ai-review-ui-shots.mjs` header; final set in
  `/Users/panat.ruangsri/Projects/bewerbungen-tracker-wt/screenshots/ai-review/final/`.

## Prompt quality (prompt `2026-11-12.v7`, Haiku 5.5, 11 samples × 3 runs)
32/33 runs pass all automatic checks; every score is in its expected range and stable (spread ≤ 5).
Weak letters 35–44, medium 62–76, strong 87–90, CV 25–26, non-application 7–10; prompt injection never worked.
One run paraphrased a "vorher" quote instead of copying it. Details: `PROMPT-NOTES.md`, `results/SUMMARY.md`.
The eval used the `claude` CLI, not the raw API – rerun once with the real key.

Rerun (needs a logged-in `claude` CLI or `CLAUDE_BIN`):
```bash
node --experimental-strip-types scripts/ai-review-eval.mjs                  # all samples, 1 run
node --experimental-strip-types scripts/ai-review-eval.mjs 08 --runs 3      # one sample, 3 runs
node --experimental-strip-types scripts/ai-review-eval.mjs --model claude-sonnet-5-5
```
