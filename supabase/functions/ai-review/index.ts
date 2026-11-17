// Supabase Edge Function "ai-review" (Deno). Wires the real dependencies into handler.ts.
// Env (Supabase secrets, never in code): SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY (provided by
// Supabase), ANTHROPIC_API_KEY (missing → mock mode), AI_REVIEW_MODEL, AI_REVIEW_MOCK, and the limits / budgets / kill
// switch documented in limits.ts (AI_REVIEW_DISABLED, AI_REVIEW_IP_LIMIT, AI_REVIEW_BURST_LIMIT,
// AI_REVIEW_DEFAULT_DAILY_LIMIT, AI_DAILY_BUDGET_USER_TOKENS, AI_DAILY_BUDGET_GLOBAL_TOKENS).
// Requires migration 20261117010000_rate_limits.sql (rpc rate_limit_hit); without it every check fails closed (503).
import { createClient } from "@supabase/supabase-js";
import { unzipSync } from "fflate";
import { extractText } from "unpdf";
import { createHandler, type ReviewRow } from "./handler.ts";

const env = (name: string) => Deno.env.get(name);
const url = env("SUPABASE_URL") ?? "";
const noSession = { auth: { persistSession: false, autoRefreshToken: false } };
const authClient = createClient(url, env("SUPABASE_ANON_KEY") ?? "", noSession);
const admin = createClient(url, env("SUPABASE_SERVICE_ROLE_KEY") ?? "", noSession);

const handler = createHandler({
  env,
  async verifyUser(token) {
    const { data, error } = await authClient.auth.getUser(token);
    return error || !data.user ? null : { id: data.user.id };
  },
  async saveConsent(userId, atIso) {
    const { error } = await admin.from("ai_review_user_settings").upsert({ user_id: userId, consent_at: atIso }, { onConflict: "user_id" });
    if (error) throw new Error(`consent: ${error.code}`);
  },
  async getDailyLimit(userId) {
    const { data, error } = await admin.from("ai_review_user_settings").select("daily_limit").eq("user_id", userId).maybeSingle();
    if (error) throw new Error(`settings: ${error.code}`);
    return (data?.daily_limit as number | null | undefined) ?? null;
  },
  async rateLimit(key, limit, windowSeconds, cost) {
    const { data, error } = await admin.rpc("rate_limit_hit", { p_key: key, p_limit: limit, p_window_seconds: windowSeconds, p_cost: cost });
    if (error) throw new Error(`rate_limit_hit: ${error.code}`);
    const row = (Array.isArray(data) ? data[0] : data) as { allowed?: boolean; retry_after?: number } | null;
    if (!row || typeof row.allowed !== "boolean") throw new Error("rate_limit_hit: empty result");
    return { allowed: row.allowed, retryAfter: Number(row.retry_after) || 0 };
  },
  async insertReview(row: ReviewRow) {
    const { data, error } = await admin.from("ai_reviews").insert(row).select("id, created_at").single();
    if (error || !data) throw new Error(`insert: ${error?.code}`);
    return { id: data.id as string, created_at: data.created_at as string };
  },
  extract: {
    unzip: (bytes, only) => unzipSync(bytes, only ? { filter: (f) => only(f.name, f.originalSize) } : undefined),
    pdfText: async (bytes) => (await extractText(bytes, { mergePages: true })).text,
  },
  // Codes and counts only – never the application text.
  log: (event, meta) => console.log(JSON.stringify({ event, ...meta })),
});

Deno.serve(handler);
