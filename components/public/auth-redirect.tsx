"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Renders nothing. Signed-in visitors of "/" are sent to their role's home (dashboard / teacher area); logged-out visitors stay.
 * The Supabase client and the role rules are loaded after the first paint (dynamic import), so the public home page does not
 * ship them in its initial JavaScript. The redirect decision itself is unchanged (getSession + resolveLanding).
 */
export function AuthRedirect() {
  const router = useRouter();
  useEffect(() => {
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
