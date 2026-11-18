"use client";

import { useParams } from "next/navigation";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { StudentTimelineView } from "@/components/teacher/student-timeline";

export default function Page() {
  const { id, studentId } = useParams<{ id: string; studentId: string }>();
  return (
    <WorkspaceShell active="Klassen">
      <StudentTimelineView classId={id} studentId={studentId} />
    </WorkspaceShell>
  );
}
