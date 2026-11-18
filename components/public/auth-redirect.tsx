"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** True when this browser may have a session (stored Supabase token) or is returning from an auth link (?code= / #access_token). */
function maySignIn(): boolean {
  try {
    const { search, hash } = window.location;
    if (/[?&](code|error)=/.test(search) || /access_token|error=/.test(hash)) return true;
    for (let i = 0; i < localStorage.length; i++) if (/^sb-.+-auth-token$/.test(localStorage.key(i) ?? "")) return true;
    return false;
  } catch {
    return true; // storage blocked: fall back to asking Supabase
  }
}

/**
 * Renders nothing. Signed-in visitors of "/" are sent to their role's home (dashboard / teacher area); logged-out visitors stay.
 * The Supabase client is loaded only when a session is possible, so first-time visitors of the landing page do not download
 * and run it (mobile LCP / TBT).
 */
export function AuthRedirect() {
  const router = useRouter();
  useEffect(() => {
    if (!maySignIn()) return;
    let alive = true;
    Promise.all([import("@/lib/supabase"), import("@/lib/role")])
      .then(([{ supabase }, { resolveLanding }]) => supabase.auth.getSession()
        .then(async ({ data }) => (data.session ? resolveLanding(null) : null)))
      .catch(() => null)
      .then((path) => { if (alive && path) router.replace(path); });
    return () => { alive = false; };
  }, [router]);
  return null;
}
