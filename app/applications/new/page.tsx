import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ApplicationForm } from "@/components/applications/application-form";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { Card } from "@/components/ui/card";

export default function NewApplicationPage() {
  return (
    <WorkspaceShell active="Bewerbungen">
      <Link href="/applications" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-muted transition-colors hover:text-[var(--ink)]">
        <ArrowLeft size={16} /> Zurück zu Bewerbungen
      </Link>
      <div className="mt-4 max-w-2xl">
        <h1 className="text-title">Neue <span className="marker">Bewerbung</span></h1>
        <p className="mt-2 text-body text-muted">Firma und Stelle reichen erst einmal. Den Rest kannst du später ergänzen.</p>
        <Card className="mt-6 p-4 sm:p-7">
          <ApplicationForm />
        </Card>
      </div>
    </WorkspaceShell>
  );
}
