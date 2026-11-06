"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { TeacherClassView } from "@/components/teacher/class-view";

export default function Page() {
  const { id } = useParams<{ id: string }>();
  return (
    <WorkspaceShell active="Übersicht">
      <Suspense fallback={null}>
        <TeacherClassView classId={id} />
      </Suspense>
    </WorkspaceShell>
  );
}
