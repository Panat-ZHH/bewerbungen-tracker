// Screen 0 «Dein Weg» of the sign-up funnel /start (SPEC-FLOW §2.2). No "use client" and no hooks of its own: the server
// page renders it as the Suspense fallback (static HTML → fast LCP, M2), the client Funnel renders the SAME markup once it
// runs, so the swap at hydration is invisible (same layout, no shift). Only the CTA differs (start link / resume card).
import Link from "next/link";
import type { ReactNode, Ref } from "react";
import { ArrowRight } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { JourneyPath } from "./journey-path";
import { BottomBar, FunnelTopBar } from "./ui";
import styles from "./funnel.module.css";

/** «Los geht’s» – a real link, so it works before the JS is loaded (server fallback) and after (client funnel). */
export function StartCta({ href, login }: { href: string; login: string | null }) {
  return (
    <div>
      <Link href={href} scroll={false} data-testid="funnel-start" className={buttonClasses({ variant: "primary", size: "lg", full: true, className: "min-h-[52px] text-[17px]" })}>Los geht’s<ArrowRight size={18} strokeWidth={2.4} aria-hidden /></Link>
      {login && <p className="mt-2 text-center text-small text-muted lg:text-left">Schon ein Konto? <Link href={login} className="inline-flex min-h-11 items-center font-semibold text-[var(--ink)] underline decoration-2 underline-offset-4">Anmelden</Link></p>}
    </div>
  );
}

/**
 * Layout: phones = text, journey, CTA in the fixed bottom bar; ≥ 1024 = two columns, the same CTA element sits static under
 * the text (CSS only – `display: contents` + `order` on phones –, no media query in JS → identical server and client markup).
 * One CTA in the DOM.
 * `animateSkipMs`: the server copy already played part of the draw-in; the client copy continues instead of restarting.
 */
export function WegScreen({ cta, login, animate, animateSkipMs = 0, headingRef, ssr = false }: {
  cta: ReactNode; login: string | null; animate: boolean; animateSkipMs?: number; headingRef?: Ref<HTMLHeadingElement>; ssr?: boolean;
}) {
  return (
    <div data-ui="app" className="workspace-bg min-h-[100dvh] overflow-x-clip px-4 sm:px-6" data-weg-ssr={ssr ? "" : undefined}>
      <div className={cn("mx-auto w-full max-w-[1120px] pb-4", ssr && styles.wegSsr)}>
        <FunnelTopBar showLogo loginHref={login} />
        <main className={cn("grid gap-6 pt-2 lg:grid-cols-[1fr_minmax(0,520px)] lg:items-center lg:gap-12 lg:pt-8")} data-testid="funnel-step-weg" data-step="weg">
          <div className={styles.wegLeft}>
          <div className="space-y-4 lg:space-y-6">
            <h1 ref={headingRef} tabIndex={-1} className="text-[1.875rem] font-extrabold leading-[1.05] tracking-[-.03em] outline-none min-[400px]:text-[2rem] lg:text-[clamp(3rem,4.6vw,4.25rem)]">
              Dein Weg – von der Bewerbung bis zum <span className="marker">unterschriebenen Lehrvertrag</span>
            </h1>
            <p className="max-w-[46ch] text-[17px] leading-relaxed">WendApply begleitet dich bei jedem Schritt. Beantworte ein paar kurze Fragen, dann bekommst du deinen Plan.</p>
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-small text-muted" data-testid="funnel-facts"><li>2 Minuten</li><li>7 Tage gratis testen</li><li>Ohne Kreditkarte</li></ul>
          </div>
          <BottomBar testId="funnel-start-bar" className={styles.wegBar} spacerClassName={styles.wegSpacer}>{cta}</BottomBar>
          </div>
          <JourneyPath animate={animate} skipMs={animateSkipMs} fit className={cn("mx-auto w-full max-w-[420px] lg:max-w-[520px]", styles.wegPath)} />
        </main>
      </div>
      {ssr && (
        // Deep link / reload on a later step (?schritt=…, ?nach=google): the inline script (page.tsx) hides this intro until the funnel runs.
        <main className={cn("flex min-h-[60dvh] items-center justify-center", styles.wegSsrWait)}>
          <p role="status" className="flex items-center gap-3 text-body text-muted"><span aria-hidden className="spinner h-5 w-5 text-[var(--brand)]" />Einen Moment …</p>
        </main>
      )}
    </div>
  );
}
