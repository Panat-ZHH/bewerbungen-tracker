"use client";

import { DocumentLibrary } from "@/components/documents/document-library";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { Sparkles } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";

export default function DocumentsPage() {
  return (
    <WorkspaceShell active="Lebensläufe">
      <PageHeader title={<>Meine <span className="marker">Dokumente</span></>} description="Lebenslauf, Motivationsschreiben, Zeugnisse und Foto an einem Ort. Nur du siehst sie, und du hängst sie bei jeder Bewerbung an." actions={<ButtonLink href="/bewerbung-check" variant="secondary" icon={<Sparkles size={15} strokeWidth={2.2} />}>Bewerbung checken lassen</ButtonLink>} />
      <DocumentLibrary />
    </WorkspaceShell>
  );
}
