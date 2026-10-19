"use client";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center bg-[#f5f5f7] px-5 text-center">
      <h1 className="text-2xl font-semibold">Das hat nicht geklappt.</h1>
      <p className="mt-2 text-sm text-[#6e6e73]">Lade die Seite noch einmal.</p>
      <button onClick={reset} className="mt-6 min-h-10 rounded-full bg-[#0866d6] px-5 text-sm font-semibold text-white">Noch einmal versuchen</button>
    </main>
  );
}