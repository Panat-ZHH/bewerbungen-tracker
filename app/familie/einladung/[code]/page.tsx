"use client";

import { useParams } from "next/navigation";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { FamilyView } from "@/components/family/family-view";
import { normalizeInviteCode } from "@/lib/family-core";

/** Invite link (/familie/einladung/ABCD1234): the family page with the code pre-filled. Logged-out users come back here after login. */
export default function Page() {
  const { code } = useParams<{ code: string }>();
  return (
    <WorkspaceShell active="Familie">
      <FamilyView initialCode={normalizeInviteCode(decodeURIComponent(code ?? ""))} />
    </WorkspaceShell>
  );
}
