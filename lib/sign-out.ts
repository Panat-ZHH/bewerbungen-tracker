// Logout that never leaves a usable session behind (unit tested in tests/auth-hardening.test.mjs).
import { clearSnapshots } from "./snapshot-cache.ts";
type SignOutResult = { error: unknown } | void;
export interface SignOutAuth { signOut(options?: { scope?: "global" | "local" | "others" }): Promise<SignOutResult> }

/**
 * Scope "global" revokes every refresh token of the user on the server. supabase-js keeps the local session when that
 * call fails (offline, 5xx), so the user would look logged out but stay signed in on this device: then the local
 * session is dropped as well. Returns true when the server-side revoke went through.
 */
export async function signOutEverywhere(auth: SignOutAuth): Promise<boolean> {
  clearSnapshots(); // device snapshots of the home screens (lib/snapshot-cache.ts) go first, whatever the server answers
  let ok = false;
  try { const r = await auth.signOut({ scope: "global" }); ok = !(r && r.error); } catch { ok = false; }
  if (!ok) { try { await auth.signOut({ scope: "local" }); } catch { /* local storage only, nothing else to do */ } }
  return ok;
}
