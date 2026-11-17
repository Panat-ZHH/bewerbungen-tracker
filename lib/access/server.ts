// Server-side access check for API routes (Node runtime). Asks the database with the CALLER's token, so the decision is
// exactly public.has_app_access() (supabase/migrations/20261118010000_access_core.sql) – one rule, one place.
// Old database without the function (PGRST202) → access (the feature is simply not live yet). Any other error → access
// too, but logged: the per-user parts gated here (job search) are rate limited and cheap, an outage must not lock
// everybody out. The real paywall is in the database (restrictive RLS + guarded RPCs).
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { isMissingFunction } from "./core.ts";

export const PAYWALL_STATUS = 402;
export function paywallResponse(headers: Record<string, string> = { "Cache-Control": "no-store" }): Response {
  return Response.json({ error: "paywall", message: "Deine Gratis-Testwoche ist vorbei. Wähle ein Abo, um weiterzumachen." }, { status: PAYWALL_STATUS, headers });
}

/** has_app_access() through any client whose JWT is the caller (or the service role with p_uid). */
export async function hasAppAccessVia(client: Pick<SupabaseClient, "rpc">, userId?: string): Promise<boolean> {
  try {
    const { data, error } = await client.rpc("has_app_access", userId ? { p_uid: userId } : {});
    if (error) {
      if (!isMissingFunction(error)) console.warn("has_app_access failed", error.code ?? "unknown");
      return true;
    }
    return data !== false;
  } catch {
    return true;
  }
}

/** Caller's access with their bearer token (public URL + publishable key, RLS as the user). */
export async function hasAppAccess(token: string): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key || !token) return true;
  const client = createClient(url, key, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } });
  return hasAppAccessVia(client);
}
