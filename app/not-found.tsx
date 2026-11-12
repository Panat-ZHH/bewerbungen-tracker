import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { DoodleLoopArrow } from "@/components/ui/doodles";

export const metadata: Metadata = { title: "Seite nicht gefunden" };

export default function NotFound() {
  return (
    <main className="workspace-bg flex min-h-[100dvh] flex-col justify-center overflow-x-clip px-5 py-10">
      <div className="animate-rise mx-auto w-full max-w-lg">
        <div className="flex items-end gap-3" aria-hidden>
          <span className="num-display tilt-l3 inline-block rounded-[var(--radius-xl)] border-[length:var(--border-w)] border-[var(--outline-fill)] bg-[var(--sun)] px-4 pb-2 pt-3 text-[var(--on-sun)] shadow-[var(--shadow-lg)]">404</span>
          <DoodleLoopArrow className="mb-2 h-10 w-20 text-[var(--brand)]" />
        </div>
        <h1 className="text-display mt-8">Diese Seite gibt es nicht.</h1>
        <p className="mt-4 text-lg text-muted">Vielleicht hat sich der Link geändert.</p>
        <ButtonLink href="/dashboard" size="lg" className="mt-8" icon={<ArrowRight size={18} strokeWidth={2.4} aria-hidden />}>Zur Startseite</ButtonLink>
      </div>
    </main>
  );
}
