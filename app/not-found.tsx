import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center bg-[#f5f5f7] px-5 text-center">
      <h1 className="text-3xl font-semibold tracking-[-1px]">Diese Seite gibt es nicht.</h1>
      <p className="mt-2 text-sm text-[#6e6e73]">Vielleicht hat sich der Link geändert.</p>
      <Link href="/dashboard" className="mt-6 inline-flex min-h-10 items-center rounded-full bg-[#0866d6] px-5 text-sm font-semibold text-white">Zur Startseite</Link>
    </main>
  );
}