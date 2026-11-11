"use client";

import { RotateCcw, TriangleAlert } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="workspace-bg flex min-h-[100dvh] flex-col items-center justify-center px-5 text-center">
      <div role="alert" className="panel animate-pop flex w-full max-w-md flex-col items-center px-6 py-10 sm:py-12">
        <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-[var(--danger-bg)] text-[var(--danger-fg)] shadow-[var(--shadow-sm)]"><TriangleAlert size={26} /></span>
        <h1 className="text-title mt-6">Das hat nicht geklappt.</h1>
        <p className="text-body mt-2 text-muted">Versuch es noch einmal. Deine Daten sind nicht verloren.</p>
        <div className="mt-7 flex flex-wrap justify-center gap-2">
          <Button onClick={reset} size="lg" icon={<RotateCcw size={16} />}>Noch einmal versuchen</Button>
          <ButtonLink href="/dashboard" variant="ghost" size="lg">Zur Startseite</ButtonLink>
        </div>
      </div>
    </main>
  );
}
