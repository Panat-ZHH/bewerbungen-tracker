import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

/**
 * Signed-in user from the locally stored session (perf round 2026-11-17).
 * `auth.getUser()` asks the Supabase auth server every time (one extra round trip to Ireland before each read); the data helpers
 * only need the user id to build their queries, so they read the session instead. getSession() refreshes an expired access
 * token first. Security is unchanged: every request carries the JWT and RLS / the RPCs check auth.uid() on the server; a revoked
 * session simply gets 401 answers. The workspace shell still verifies the user with getUser() once in the background.
 */
export async function sessionUser(): Promise<User | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user ?? null;
}

/** Id of the signed-in user, or throws "You must be signed in." (same message as the old getUser() helpers). */
export async function requireUserId(): Promise<string> {
  const user = await sessionUser();
  if (!user) throw new Error("You must be signed in.");
  return user.id;
}
