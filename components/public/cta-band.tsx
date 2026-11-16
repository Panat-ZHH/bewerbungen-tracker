import type { ReactNode } from "react";
import { DoodlePlane, DoodleSparkle, DoodleTrail } from "@/components/ui/doodles";

/** Yellow call-to-action band used at the end of the public marketing pages. */
export function CtaBand({ id = "cta", title, text, children }: { id?: string; title: ReactNode; text: ReactNode; children: ReactNode }) {
  return (
    <section aria-labelledby={`${id}-h`} className="mx-auto w-full max-w-6xl overflow-x-clip px-4 pb-16 pt-4 sm:px-6 sm:pb-24">
      <div className="relative rounded-[var(--radius-xl)] border-[length:var(--border-w)] border-[var(--outline-fill)] bg-[var(--sun)] px-6 py-10 text-[var(--on-sun)] shadow-[var(--shadow-lg)] sm:px-12 sm:py-14">
        <DoodleSparkle className="absolute right-6 top-6 h-8 w-8 sm:right-10" />
        <h2 id={`${id}-h`} className="text-display max-w-2xl">{title}</h2>
        <p className="mt-4 max-w-xl text-base">{text}</p>
        <div className="mt-7 flex flex-wrap gap-3">{children}</div>
        <div className="pointer-events-none absolute bottom-6 right-8 hidden items-end gap-1 md:flex" aria-hidden>
          <DoodleTrail className="h-12 w-36" />
          <DoodlePlane className="mb-6 h-12 w-16" />
        </div>
      </div>
    </section>
  );
}
