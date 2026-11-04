"use client";

import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { ClassesPage } from "@/components/classes/classes-page";

export default function Page() {
  return (
    <WorkspaceShell active="Klassen">
      <ClassesPage />
    </WorkspaceShell>
  );
}
