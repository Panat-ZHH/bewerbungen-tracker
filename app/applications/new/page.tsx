import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ApplicationForm } from "@/components/applications/application-form";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { Card } from "@/components/ui/card";

export default function NewApplicationPage() {
  return (
    <WorkspaceShell active="Bewerbungen">
      <Link href="/applications" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-muted transition hover:text-[var(--brand)]">
        <ArrowLeft size={16} /> Zurück zu Bewerbungen
      </Link>
      <div className="mt-4 max-w-2xl">
        <h1 className="text-[28px] font-semibold tracking-[-1px] md:text-[38px]">Neue Bewerbung</h1>
        <p className="mt-2 text-base text-muted">Firma und Stelle reichen erst einmal. Den Rest kannst du später ergänzen.</p>
        <Card className="mt-6 p-4 sm:p-7">
          <ApplicationForm />
        </Card>
      </div>
    </WorkspaceShell>
  );
}
