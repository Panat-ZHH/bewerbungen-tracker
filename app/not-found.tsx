import Link from "next/link";
import { Compass } from "lucide-react";

export default function NotFound() {
  return (
    <main className="workspace-bg flex min-h-[100dvh] flex-col items-center justify-center px-5 text-center">
      <div className="panel flex w-full max-w-md flex-col items-center px-6 py-10">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#eaf3ff] text-[#0866d6]"><Compass size={22} /></span>
        <h1 className="mt-5 text-2xl font-semibold tracking-[-.5px]">Diese Seite gibt es nicht.</h1>
        <p className="mt-2 text-sm text-muted">Vielleicht hat sich der Link geändert.</p>
        <Link href="/dashboard" className="mt-6 inline-flex min-h-11 items-center rounded-full bg-[#0866d6] px-6 text-sm font-semibold text-white transition hover:bg-[#075bbb] active:scale-[.98]">Zur Startseite</Link>
      </div>
    </main>
  );
}
