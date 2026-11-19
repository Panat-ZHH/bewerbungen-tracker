import { Suspense } from "react";
import { Funnel } from "@/components/funnel/funnel";
import { StartCta, WegScreen } from "@/components/funnel/weg-screen";

// Runs while the HTML is parsed, before the server copy of screen 0 paints: on a deep link / reload of a later step
// (?schritt=<not weg>, ?nach=google) the intro must not flash, so it is swapped for «Einen Moment …» until the funnel runs
// (the Funnel removes the attribute on mount). Plain inline script: the CSP allows 'unsafe-inline' (lib/security-headers.ts).
const DEEP_LINK_GUARD = `(function(){try{var q=new URLSearchParams(location.search),s=q.get("schritt");if((s&&s!=="weg")||q.get("nach")==="google")document.documentElement.setAttribute("data-funnel-deep","")}catch(e){}})()`;

/**
 * Sign-up funnel (SPEC-FLOW §1): `/start?schritt=<slug>[&nach=google][&next=<safe path>]`.
 * The page is static; the client Funnel reads the query (useSearchParams) and therefore renders on the client. Its Suspense
 * fallback is screen 0 «Dein Weg» itself (QA M2: the LCP text is in the server HTML instead of «Einen Moment …»), with the
 * same markup the Funnel renders, so the swap after hydration does not move anything.
 */
export default function StartPage() {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: DEEP_LINK_GUARD }} />
      <Suspense fallback={<WegScreen ssr animate cta={<StartCta href="/start?schritt=rolle" login="/login" />} login="/login" />}>
        <Funnel />
      </Suspense>
    </>
  );
}
