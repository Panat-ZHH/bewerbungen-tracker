import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ApplicationForm } from "@/components/applications/application-form";
import { WorkspaceShell } from "@/components/layout/workspace-shell";

export default function NewApplicationPage() {
  return (
    <WorkspaceShell active="Bewerbungen">
      <Link href="/applications" className="inline-flex min-h-9 items-center gap-2 text-sm font-medium text-[#5e5e63] hover:text-[#0866d6]">
        <ArrowLeft size={16} /> Zurück zu Bewerbungen
      </Link>
      <div className="mt-7 max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-[-1px] md:text-[38px]">Neue Bewerbung</h1>
        <p className="mt-2 text-base text-muted">Firma und Stelle reichen erst einmal. Den Rest kannst du später ergänzen.</p>
        <div className="glass-surface mt-7 rounded-[14px] p-5 sm:p-7">
          <ApplicationForm />
        </div>
      </div>
    </WorkspaceShell>
  );
}