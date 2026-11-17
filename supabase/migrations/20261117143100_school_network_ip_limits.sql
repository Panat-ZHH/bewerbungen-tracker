-- Flows re-audit 2 (2026-11-17): per-IP limits of the code / invite-link RPCs fit a whole school behind one IP.
-- 20261117020000_rate_limit_rpcs.sql counts every class/family/friend code lookup per client IP: 300 per hour and
-- 1000 per day ("code" / "code-day"), invite links 300 per hour ("invite-token"). Schools (and often a whole canton's
-- school network) reach Supabase through ONE public IP. One class joining costs about 4 calls per pupil (invite_context
-- on the login page, class_preview, class_join, a reload); a "add your classmates as friends" exercise adds a code
-- lookup per friend. Two or three classes in the same hour – or a year group at an info event – already hit 300/h, and
-- the next pupils get "Bitte warte …" for up to an hour.
-- The per-USER limits (30/h, 100/day on codes) are what makes guessing hopeless and stay unchanged. The per-IP limit only
-- matters for anonymous invite_context and for attackers with many accounts; with 40-bit codes 1000/h per IP still
-- leaves guessing pointless.
-- How: rows in public.rate_limit_settings (only ip_limit set; user_limit / window_seconds NULL = keep the defaults of
-- the wrappers). ON CONFLICT DO NOTHING: values an operator already set are kept. Tune later without a deploy, e.g.
--   update public.rate_limit_settings set ip_limit = 2000 where scope = 'code';
-- ADDITIVE + idempotent, no function is replaced.

insert into public.rate_limit_settings (scope, ip_limit, note) values
  ('code', 1000, 'school networks: many pupils behind one IP (re-audit 2, flows)'),
  ('code-day', 3000, 'school networks: many pupils behind one IP (re-audit 2, flows)'),
  ('invite-token', 1000, 'school networks: many pupils behind one IP (re-audit 2, flows)')
on conflict (scope) do nothing;
