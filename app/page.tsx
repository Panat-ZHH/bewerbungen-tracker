"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { resolveLanding } from "@/lib/role";

/** Signed in: straight to the role's home. Otherwise: login. */
export default function Home() {
  const router = useRouter();
  useEffect(() => {
    let alive = true;
    supabase.auth.getSession()
      .then(async ({ data }) => (data.session ? resolveLanding(null) : "/login"))
      .catch(() => "/login")
      .then((path) => { if (alive) router.replace(path); });
    return () => { alive = false; };
  }, [router]);
  return <main className="workspace-bg flex min-h-[100dvh] items-center justify-center" aria-busy="true"><p role="status" className="text-sm text-muted">Einen Moment …</p></main>;
}
