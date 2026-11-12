"use client";

import { RotateCcw } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { DoodleSquiggle } from "@/components/ui/doodles";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="workspace-bg flex min-h-[100dvh] flex-col justify-center px-5 py-10">
      <div role="alert" className="animate-rise mx-auto w-full max-w-lg">
        <DoodleSquiggle className="h-16 w-16 text-[var(--coral)]" />
        <h1 className="text-display mt-4">Das hat <span className="marker-coral">nicht geklappt.</span></h1>
        <p className="mt-4 text-lg text-muted">Versuch es noch einmal. Deine Daten sind nicht verloren.</p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Button onClick={reset} size="lg" icon={<RotateCcw size={16} strokeWidth={2.4} />}>Noch einmal versuchen</Button>
          <ButtonLink href="/dashboard" variant="ghost" size="lg">Zur Startseite</ButtonLink>
        </div>
      </div>
    </main>
  );
}
