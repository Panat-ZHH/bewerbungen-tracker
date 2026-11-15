# Report – AI review backend (branch `ai-backend`)

## What was built

**Migration** `supabase/migrations/20261112000000_ai_reviews.sql` (additive, idempotent)
- `public.ai_reviews` (id, user_id → auth.users **on delete cascade**, created_at, file_name, company, beruf,
  score 0–100, result jsonb, model, prompt_version) + index `(user_id, created_at desc)`.
- `public.ai_review_user_settings` (user_id pk → auth.users cascade, daily_limit int null (≥ 0), consent_at).
- RLS: owners may `select` + `delete` their reviews and `select` their settings. `authenticated` has no
  insert/update grants; `anon` has no grants. Writes only via the service role (edge function).
- Account deletion needs no extra code: `deleteAccount` deletes the auth user and both tables cascade;
  `account_data_report` finds them automatically (it walks all FKs to auth.users). There is no data-export list in
  `lib/`. The user-facing list in `lib/account-deletion.ts` now mentions "Bewerbungs-Checks".

**Edge function** `supabase/functions/ai-review/` (Deno)
- `index.ts` – wiring only: supabase-js (`auth.getUser` with the anon key; DB with the service role key),
  `fflate` + `unpdf` via `deno.json` import map, `Deno.serve`.
- `handler.ts` – the request flow with injected dependencies (testable in Node): CORS/OPTIONS → POST only →
  Bearer JWT → multipart → `consent=true` → file ≤ 5 MB, field lengths (company/beruf 200, jobAd 8000) →
  upsert `consent_at` → optional daily limit (user setting, else `AI_REVIEW_DEFAULT_DAILY_LIMIT`, unset = no limit;
  counted from `ai_reviews` of the last 24 h) → magic-byte check + in-memory extraction → mock or Anthropic →
  `normalizeReview` → insert result row → `AiReviewResponse`. Unknown errors → generic 502, no details leaked.
- `extract.ts` – magic bytes (`%PDF-` / ZIP containing `word/document.xml`), DOCX `w:t`/`w:p`/`w:tab`/`w:br`
  parsing (ignores deleted text and field codes), whitespace cleaning, < 150 chars → `no_text` (hint about
  scanned PDFs), > 20'000 → `too_long`, daily-limit helpers, file-name sanitising.
- `anthropic.ts` – raw `fetch` to `POST /v1/messages`, headers `x-api-key` + `anthropic-version: 2026-10-21`,
  model `AI_REVIEW_MODEL` (default `claude-haiku-5-5`), `output_config: { effort: "medium", format: { type:
  "json_schema", schema: REVIEW_JSON_SCHEMA } }` (format is omitted while the schema is still the empty stub),
  `max_tokens` 8000, no sampling params / no prefill (rejected by current models). 60 s timeout, **one** retry on
  429 / 5xx / network error / unusable JSON (honours `retry-after`, max 10 s). No retry on 4xx, refusal, timeout.
- `mock.ts` – deterministic review from heuristics (length, Anrede, Grussformel, company/Beruf mentioned,
  motivation words, "ß"). Used when `ANTHROPIC_API_KEY` is missing or `AI_REVIEW_MOCK=1`; response `mock: true`,
  row stored with `model = 'mock'`.
- `errors.ts` – error codes → HTTP status → friendly Swiss-German messages (no "ß").
- Privacy: the file and its text never leave memory; only the result row is inserted; logs contain event codes,
  char count, score and mock flag – never the text, file name or form fields.

**Other files touched**
- `tsconfig.json`: excludes `supabase/functions/*/index.ts` (uses the `Deno` global; the other function files are
  plain TS and still type-check with the Next.js project).
- `package.json`: dev dependency `unpdf` (for the Node tests; `fflate` was already present transitively).

## How to test
- `npm test` – 356/356 pass, including `tests/ai-review-backend.test.mjs` (25 tests: PDF/DOCX fixtures generated
  in the test, scanned PDF, wrong types, size/length limits, daily limit, mock, Anthropic request shape + retry
  rules with a stubbed fetch, full handler flow incl. privacy of row/logs, migration RLS + cascade in pglite).
  `tests/migrations.test.mjs` still passes (new migration is re-runnable).
- `cd supabase/functions/ai-review && deno check *.ts && deno lint` – clean (Deno 2.9.8 via Homebrew).
- `npm run lint` – 0 errors (8 old warnings in unrelated files). `next build` succeeds.
- Locally against a Supabase dev stack (not done here, never against the live project):
  `supabase start && supabase functions serve ai-review --env-file .env.local` then
  `curl -H "Authorization: Bearer <user token>" -F file=@Bewerbung.pdf -F consent=true -F company="Beispiel AG"
  http://127.0.0.1:54321/functions/v1/ai-review`.

## Open points
- Not applied/deployed (by design): migration (`db push`), function (`functions deploy`), secrets
  (`ANTHROPIC_API_KEY`, optional `AI_REVIEW_MODEL`, `AI_REVIEW_DEFAULT_DAILY_LIMIT`). Needs the user's OK.
- No `supabase/config.toml` exists in the repo; default `verify_jwt = true` is fine (the client sends the user JWT).
- `prompt.ts` is still the stub on this branch: with a real key the request is sent without structured output until
  the ai-prompt branch is merged (the handler tolerates fenced JSON in the meantime). Re-run the tests after the merge
  – the mock result must also pass the real `normalizeReview` (it already respects all list sizes of the contract).
- Real Anthropic call not exercised (no API key yet); only the request shape and retry logic are tested.
- Effort is `medium` (Haiku 5.5 default); can be tuned once real feedback quality is visible.
- In `mock` mode the row is stored and `id` is returned (the BRIEF's `id: null` applies to the client-side preview
  mock `NEXT_PUBLIC_AI_REVIEW_MOCK=1`, not to the server mock).
- PDF + DOCX extraction was smoke-tested in plain Deno 2.9.8 (`deno run`, unpdf + fflate via the import map); the
  Supabase Edge runtime itself (`functions serve`) was not run – do one smoke test with a real PDF before deploying.
