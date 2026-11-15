# Report – part "ai-prompt" (branch `ai-prompt`)

## What I built
- **`supabase/functions/ai-review/prompt.ts`** (replaces the stub, same exports, imports only `./types.ts`):
  - `PROMPT_VERSION` = `2026-11-12.v7`.
  - `SYSTEM_PROMPT`: static German prompt (Swiss spelling) for pupils of about 14. It covers tone rules (Du-Form,
    short sentences, no jargon, concrete and text-based), before/after rules ("vorher" = verbatim quote or `fehlt`,
    "nachher" = copyable, error-free, pupil's voice, placeholders instead of invented facts), "never invent company
    facts", and rubric anchors 5/10/15/20 for all 5 categories (with length and error-counting rules). It also handles
    edge cases: CV, not an application, very short text, other language, offensive content, personal data, and
    prompt injection (the document is data only). Fully static, so it is cache-friendly.
  - `buildUserMessage(input)`: `<beruf>`, `<firma>`, `<stelleninserat>`, then `<bewerbung>` last, then one
    instruction line. Missing fields are marked explicitly (no job ad → "company must be empty"). Our tags inside
    user data are neutralised (`</bewerbung>` → `[/bewerbung]`), and CRLF and NUL are cleaned.
  - `REVIEW_JSON_SCHEMA`: valid for Anthropic structured outputs (`output_config.format = {type:"json_schema", schema}`).
    It has no min/max/length/items constraints, `additionalProperties:false` everywhere, and all properties required.
    Extra helper fields `dokumentart`, `textsprache` and `rechtschreibfehler` are used for classification and
    counting, and `normalizeReview` drops them.
  - `normalizeReview(raw, { hasJobAd? })`: accepts an object or a JSON string (also inside ``` fences). It clamps and
    rounds scores to 0–20 and accepts numeric strings. It applies hard caps for CV / non-application / other language
    (`SCORE_CAPS`, because Haiku ignores numeric caps in prompts). It recomputes the total, keeps the
    `AI_REVIEW_CATEGORIES` order and labels, and enforces list sizes (good ≤4, improve ≤5, company ≤3). It drops empty
    tips and examples without "nachher", replaces ß/ẞ with ss/SS everywhere, collapses whitespace, caps strings at
    600 chars, and empties `company` when `hasJobAd === false`. It **throws** when the breakdown or a category is
    missing, a score is not numeric, or the summary, good list or improve list is empty.
- **`tests/ai-review-prompt.test.mjs`**: 19 unit tests (contract and import rule, static prompt with no ß, schema
  keyword validity, buildUserMessage incl. tag break-out, every normalizeReview rule incl. caps and throws, sample
  files well-formed).
- **`scripts/ai-review-eval.mjs`**: runs every sample through the real prompt with the local Claude Code CLI as the
  model, normalises the output, auto-checks it (score range, ß, verbatim quotes, sentence length, company list,
  injection, document type) and writes `docs/ai-review/results/<sample>.json|.md` and `SUMMARY.md`.
- **11 samples** in `docs/ai-review/samples/`: Detailhandel, Koch, Logistik, FaGe, Informatik, Elektro, KV, Polymech,
  Bäcker, plus a holiday essay. They cover weak ×3, medium ×3, strong ×2, spelling mistakes, a CV, prompt injection,
  English, no job ad, and a wrong company name.
- **`docs/ai-review/PROMPT-NOTES.md`**: 7 tuning rounds and the final score table.

## Result
Final eval (Haiku 5.5, 3 runs per sample): **32/33 runs pass all automatic checks**, and every score is in its
expected range. The ranking is consistent and stable (spread ≤5 points). The injection never works. I reviewed all
outputs by hand for accuracy, kindness, concreteness, age fit and Swiss spelling.

## How to test
```bash
npm test                                                                         # unit tests (no network)
node --experimental-strip-types scripts/ai-review-eval.mjs                       # all samples, 1 run (~1 min, ≈ $0.04)
node --experimental-strip-types scripts/ai-review-eval.mjs 08 --runs 3           # one sample, 3 runs
node --experimental-strip-types scripts/ai-review-eval.mjs --model claude-sonnet-5-5
```
The eval needs a logged-in `claude` CLI (`/Users/panat.ruangsri/.local/bin/claude`, or set `CLAUDE_BIN`).

## Notes for the backend part (edge function)
- Send `system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }]`. The prompt is
  ≈2.5–3 k tokens, above the 512-token cache minimum on Haiku 5.5.
- `output_config: { format: { type: "json_schema", schema: REVIEW_JSON_SCHEMA } }`, `max_tokens` ≈ 4000. No
  prefill (it returns 400 on current models).
- Call `normalizeReview(parsed, { hasJobAd: Boolean(jobAd?.trim()) })`. On throw, return `ai_failed` (502), or retry once.
- Check `stop_reason` (`refusal`, `max_tokens`) before parsing.

## Open points
- In about 1 of 33 runs Haiku slightly re-words a "vorher" quote instead of copying it. Option: pass the source text
  to `normalizeReview` and drop or flag examples whose "vorher" is not found in the text.
- A "good" point sometimes runs longer than the 15-word target when it quotes the pupil. It's harmless but could be
  tightened.
- The schema is validated against the documented keyword rules and through the CLI's `--json-schema`, but has not yet
  been sent to the real API (there is no API key). Run one request once the key exists.
- The eval used the CLI, not the raw Messages API. Temperature and sampling may differ slightly from production.
- The offensive-content case is handled in the prompt but has no sample, so a real test is still to do.
