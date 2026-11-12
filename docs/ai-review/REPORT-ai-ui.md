# Bewerbungs-Check – UI part (branch `ai-ui`)

## What was built
- **Page `/bewerbung-check`** (`app/bewerbung-check/page.tsx` + `layout.tsx` with metadata, noindex). Inside `WorkspaceShell` (active tab "Dokumente").
  - Intro (PageHeader) + **Vorschau-Modus** badge when `NEXT_PUBLIC_AI_REVIEW_MOCK=1` or when the server answers `mock: true`.
  - **Form** (`components/ai-review/review-form.tsx`): 3 numbered steps. (1) Upload: drag & drop zone + "Datei auswählen" button, PDF/DOCX, max 5 MB, selected file shown with "Ändern" / remove. (2) Optional Firma, Beruf/Lehrstelle, Stelleninserat (textarea with char counter, 8000 max). (3) Plain-language consent notice (Anthropic, USA; file + text not stored; only the result is saved and can be deleted; leave out AHV-Nummer etc.; link to `/datenschutz-jugend`) + required tick box. Inline errors, focus jumps to the first invalid field.
  - **Prefill** from `?application=<id>`: Firma = company, Beruf = position, Stelleninserat = job description (if any); "Zurück zur Bewerbung" link.
  - **Loading** (`review-loading.tsx`): spinner, rotating friendly progress text every 5 s, 6-segment progress strip (eases towards 95 %), "bis zu 30 Sekunden", **Abbrechen** (aborts the request).
  - **Result** (`review-result.tsx`): big score 0–100 with a friendly label (Richtig stark! / Gut unterwegs / Solide Basis / Guter Anfang – never shaming), summary, 5-row breakdown (bar + x/20 + comment, always in contract order), "Das ist schon gut", "Das kannst du verbessern" (numbered, Vorher/Nachher with **Kopieren** button + toast, "fehlt" shown as "Fehlt noch in deinem Brief"), "Tipps für diese Firma" (hidden when empty), "Dein nächster Schritt", note "Eine KI kann sich irren … Lehrperson oder Eltern".
  - **Frühere Checks** (`review-history.tsx`): list from `ai_reviews` (score, title, date, label), open → result view, delete via the existing `Modal` confirm pattern (same as "Meine Dokumente").
  - Orchestration in `components/ai-review/bewerbung-check.tsx`. After a check, file + consent are reset (consent is per send), Firma/Beruf/Inserat stay for the next try.
- **`lib/ai-review-core.ts`** (pure, unit-tested): file/form validation, field cleaning, friendly message for **every** `AiReviewErrorCode` + client codes `network`, `timeout`, `unknown`, HTTP-status fallback, score/category labels, loading text/progress, row mapping, titles, realistic sample result (`sampleReviewResult/Response`, company tips only when company info is given). Types imported from `supabase/functions/ai-review/types.ts` (contract unchanged).
- **`lib/ai-review.ts`**: `callAiReview(file, fields, { signal })` → multipart POST (`file`, `consent=true`, `company`, `beruf`, `jobAd`) to `{NEXT_PUBLIC_SUPABASE_URL}/functions/v1/ai-review` with `Authorization: Bearer <access token>` (+ `apikey` publishable key), 90 s timeout, throws `AiReviewRequestError { code, message }`. `listAiReviews()` / `deleteAiReview(id)` via supabase-js. Mock mode (`process.env.NEXT_PUBLIC_AI_REVIEW_MOCK === "1"`): no network, sample after ~1.5 s, in-memory history (per tab).
- **Links**: "Bewerbung checken lassen" button on `/cvs` (header action); on the application detail page under "Unterlagen" (`/bewerbung-check?application=<id>`); new FAQ entry on `/hilfe`. No new main-nav item (nav is already full; reached from Dokumente + each application).

## How to test
- Unit tests: `npm test` (new file `tests/ai-review-ui.test.mjs`, 12 tests: score labels, error mapping for all codes, file/form validation, loading progress, sample result vs. contract, row mapping, Swiss spelling/consent text, client mock flow incl. abort). Full suite: 343/343 pass.
- `npm run lint`: 0 errors (8 old warnings in files not touched).
- `npm run build`: in this worktree Turbopack panics because `node_modules` is a symlink pointing outside the worktree ("Symlink … points out of the filesystem root") – environment only. `npx next build --webpack` compiles successfully, `/bewerbung-check` is static. On Netlify/main checkout (real `node_modules`) the normal build should work.
- Visual check (mocked Supabase, preview mode):
  ```
  NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=dummy NEXT_PUBLIC_AI_REVIEW_MOCK=1 npx next dev --webpack -p 3207 &
  PLAYWRIGHT=/Users/panat.ruangsri/Projects/bewerbungen-tracker-wt/audit-tools/node_modules/playwright-core/index.mjs \
  CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" BASE=http://localhost:3207 node tests/ai-review-ui-shots.mjs
  ```
  Screenshots (375 + 1280, light + dark: empty form, filled, validation errors, loading, result + history, prefilled from application, detail-page link, Dokumente link) in `/Users/panat.ruangsri/Projects/bewerbungen-tracker-wt/screenshots/ai-review/`. No horizontal overflow; all own touch targets ≥ 44 px.
- Netlify preview: set `NEXT_PUBLIC_AI_REVIEW_MOCK=1` as env var for the deploy preview.

## Open points
- The edge function must allow the CORS headers `authorization, apikey, content-type` (the client sends `apikey` like supabase-js does).
- History needs the `ai_reviews` migration applied; until then (non-mock) the "Frühere Checks" list shows a friendly load error, the check itself is unaffected.
- When the server returns `mock: true` (no `ANTHROPIC_API_KEY`), the UI shows the Vorschau badge and the note on the result.
- Pre-existing: the "Dokument hochladen" link in `components/documents/application-documents.tsx` is only 18 px high on phones (not in my scope).
- Rate limit message assumes a daily limit ("Morgen geht es weiter"), matching the optional per-user `daily_limit`.
