import { Suspense } from "react";
import { Funnel } from "@/components/funnel/funnel";

function Loading() {
  return (
    <main data-ui="app" className="workspace-bg flex min-h-[100dvh] items-center justify-center px-4">
      <p role="status" className="flex items-center gap-3 text-body text-muted"><span aria-hidden className="spinner h-5 w-5 text-[var(--brand)]" />Einen Moment …</p>
    </main>
  );
}

/** Sign-up funnel (SPEC-FLOW §1): `/start?schritt=<slug>[&nach=google][&next=<safe path>]`. */
export default function StartPage() {
  return <Suspense fallback={<Loading />}><Funnel /></Suspense>;
}
