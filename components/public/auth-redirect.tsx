"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { resolveLanding } from "@/lib/role";

/** Renders nothing. Signed-in visitors of "/" are sent to their role's home (dashboard / teacher area); logged-out visitors stay. */
export function AuthRedirect() {
  const router = useRouter();
  useEffect(() => {
    let alive = true;
    supabase.auth.getSession()
      .then(async ({ data }) => (data.session ? resolveLanding(null) : null))
      .catch(() => null)
      .then((path) => { if (alive && path) router.replace(path); });
    return () => { alive = false; };
  }, [router]);
  return null;
}
