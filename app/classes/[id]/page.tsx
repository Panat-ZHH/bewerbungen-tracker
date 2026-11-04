"use client";

import { useParams } from "next/navigation";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { ClassDetail } from "@/components/classes/class-detail";

export default function Page() {
  const { id } = useParams<{ id: string }>();
  return (
    <WorkspaceShell active="Klassen">
      <ClassDetail classId={id} />
    </WorkspaceShell>
  );
}
