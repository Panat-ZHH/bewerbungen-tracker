"use client";

import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { TeacherDashboardView } from "@/components/teacher/dashboard";

export default function Page() {
  return (
    <WorkspaceShell active="Klassen">
      <TeacherDashboardView />
    </WorkspaceShell>
  );
}
