import { Funnel } from "@/components/funnel/funnel";

/**
 * Sign-up funnel (SPEC-FLOW §1): `/start?schritt=<slug>[&nach=google][&next=<safe path>]`.
 * Static page: the Funnel prerenders screen 0 «Dein Weg» (QA M2: the LCP text is in the HTML, not «Einen Moment …») and
 * hydrates it in place; only its tiny query reader (useSearchParams) waits in its own Suspense boundary. A deep link to a
 * later step hides screen 0 before it paints (head script in app/layout.tsx sets html[data-funnel-deep]).
 */
export default function StartPage() {
  return <Funnel />;
}
