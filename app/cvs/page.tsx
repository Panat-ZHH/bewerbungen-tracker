"use client";

import { DocumentLibrary } from "@/components/documents/document-library";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { PageHeader } from "@/components/ui/page-header";

export default function DocumentsPage() {
  return (
    <WorkspaceShell active="Lebensläufe">
      <PageHeader title={<>Meine <span className="marker">Dokumente</span></>} description="Lebenslauf, Motivationsschreiben, Zeugnisse und Foto an einem Ort. Nur du siehst sie, und du hängst sie bei jeder Bewerbung an." />
      <DocumentLibrary />
    </WorkspaceShell>
  );
}
