# AI-Bewerbungs-Check – shared brief for all parts (branch `ai-review`)

Goal: a pupil (about 14, Switzerland, looking for a Lehrstelle) uploads their application (PDF or DOCX; text
extracted server-side) plus optionally company name / job ad / Beruf. An AI returns a score 0-100 with a breakdown
(Aufbau, Sprache, Motivation, Passung zur Firma, Rechtschreibung; 0-20 each, total = sum), what is good, what to
improve, and company-specific suggestions, each with before/after example sentences the pupil can copy.

Language of all user-facing text: German, Swiss spelling (never "ß", always "ss"), short sentences, no jargon,
friendly, encouraging, concrete. Du-Form.

## Contract
- Types: `supabase/functions/ai-review/types.ts` (AiReviewResult, AiReviewResponse, AiReviewError). Do not change
  without updating all parts.
- Prompt module: `supabase/functions/ai-review/prompt.ts` exports `PROMPT_VERSION`, `SYSTEM_PROMPT`, `ReviewInput`,
  `buildUserMessage(input)`, `REVIEW_JSON_SCHEMA`, `normalizeReview(raw)`. Must be plain TypeScript with no
  imports except `./types.ts` (so it runs in Deno and Node `--experimental-strip-types`).
- Endpoint: `POST {SUPABASE_URL}/functions/v1/ai-review`, header `Authorization: Bearer <user access token>`,
  body `multipart/form-data`: `file` (PDF/DOCX, max 5 MB, required), `consent` = `"true"` (required),
  `company` (optional, max 200 chars), `beruf` (optional, max 200), `jobAd` (optional, max 8000).
  200 → `AiReviewResponse`; errors → `AiReviewError` with the HTTP codes listed in types.ts. CORS enabled.
- Env (Supabase secrets / local `.env`, never in code): `ANTHROPIC_API_KEY` (missing → mock mode, response
  `mock: true`), `AI_REVIEW_MODEL` (default `claude-haiku-5-5`), `AI_REVIEW_MOCK=1` (force mock),
  `AI_REVIEW_DEFAULT_DAILY_LIMIT` (unset = no limit; this is the default – NO daily limit).
- Optional per-user rate setting: table `public.ai_review_user_settings (user_id pk, daily_limit int null,
  consent_at timestamptz)`; `daily_limit null` = off (default). Only admins set it (SQL); users can read their own row.
- Storage: table `public.ai_reviews (id uuid, user_id, created_at, file_name, company, beruf, score int,
  result jsonb, model, prompt_version)`. ONLY the result is stored – never the uploaded file or its text.
  RLS: owner select + delete; insert only by the edge function (service role). Cascade on user delete.
- Client: `lib/ai-review.ts` (call the function, list/delete past reviews). `NEXT_PUBLIC_AI_REVIEW_MOCK=1` makes the
  client return a built-in sample result without network (used for Netlify previews, because the edge function
  is NOT deployed to the live Supabase project yet).
- Page: `/bewerbung-check` (+ links from "Meine Dokumente" /cvs and the application detail page).

## Rules for every part
- Always use ABSOLUTE paths (/Users/panat.ruangsri/...), never "~".
- Work only in your own worktree and only on the files your part owns. Commit on your branch. Do not push main,
  do not merge into main, do not deploy to Netlify production.
- Do NOT touch the live Supabase project (ref bhwreehwirrloxagyypi): no `db push`, no `functions deploy`, no
  `secrets set`. Migrations and functions stay local; the user will approve applying them.
- Never print or commit secrets/tokens. There is no Anthropic API key yet → everything must work in mock mode.
- Next.js here is v16 with breaking changes: read the relevant guide in `node_modules/next/dist/docs/` before
  writing Next.js code (see AGENTS.md). Use the claude-api skill for correct Anthropic API usage.
