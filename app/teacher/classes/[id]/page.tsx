"use client";

import { useParams } from "next/navigation";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { TeacherClassView } from "@/components/teacher/class-view";

export default function Page() {
  const { id } = useParams<{ id: string }>();
  return (
    <WorkspaceShell active="Klassen">
      <TeacherClassView classId={id} />
    </WorkspaceShell>
  );
}
