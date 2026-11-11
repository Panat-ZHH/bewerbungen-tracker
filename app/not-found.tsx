import type { Metadata } from "next";
import { Compass } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = { title: "Seite nicht gefunden" };

export default function NotFound() {
  return (
    <main className="workspace-bg flex min-h-[100dvh] flex-col items-center justify-center px-5 text-center">
      <div className="panel animate-pop flex w-full max-w-md flex-col items-center px-6 py-10 sm:py-12">
        <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-[var(--brand-soft)] text-[var(--brand)] shadow-[var(--shadow-sm)]"><Compass size={26} /></span>
        <p className="text-eyebrow mt-6">Fehler 404</p>
        <h1 className="text-title mt-3">Diese Seite gibt es nicht.</h1>
        <p className="text-body mt-2 text-muted">Vielleicht hat sich der Link geändert.</p>
        <ButtonLink href="/dashboard" size="lg" className="mt-7">Zur Startseite</ButtonLink>
      </div>
    </main>
  );
}
