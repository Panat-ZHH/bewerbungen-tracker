import { Suspense } from "react";
import { Funnel } from "@/components/funnel/funnel";
import { StartCta, WegScreen } from "@/components/funnel/weg-screen";

/**
 * Sign-up funnel (SPEC-FLOW §1): `/start?schritt=<slug>[&nach=google][&next=<safe path>]`.
 * The page is static; the client Funnel reads the query (useSearchParams) and therefore renders on the client. Its Suspense
 * fallback is screen 0 «Dein Weg» itself (QA M2: the LCP text is in the server HTML instead of «Einen Moment …»), with the
 * same markup the Funnel renders, so the swap after hydration does not move anything. A deep link to a later step hides this
 * copy before it paints (head script in app/layout.tsx sets html[data-funnel-deep]).
 */
export default function StartPage() {
  return (
    <Suspense fallback={<WegScreen ssr animate cta={<StartCta href="/start?schritt=rolle" login="/login" />} login="/login" />}>
      <Funnel />
    </Suspense>
  );
}
