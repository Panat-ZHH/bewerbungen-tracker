"use client";

import { RotateCcw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="workspace-bg flex min-h-[100dvh] flex-col items-center justify-center px-5 text-center">
      <div role="alert" className="panel flex w-full max-w-md flex-col items-center px-6 py-10">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#fff0f0] text-[#b42323]"><TriangleAlert size={22} /></span>
        <h1 className="mt-5 text-2xl font-semibold tracking-[-.5px]">Das hat nicht geklappt.</h1>
        <p className="mt-2 text-sm text-muted">Versuch es noch einmal. Deine Daten sind nicht verloren.</p>
        <Button onClick={reset} className="mt-6 min-h-11 px-6"><RotateCcw size={16} />Noch einmal versuchen</Button>
      </div>
    </main>
  );
}
