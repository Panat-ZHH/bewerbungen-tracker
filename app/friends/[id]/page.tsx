"use client";

import { useParams } from "next/navigation";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { FriendIslandView } from "@/components/friends/friend-island-view";

export default function FriendIslandPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <WorkspaceShell active="Freunde">
      <FriendIslandView friendId={decodeURIComponent(id ?? "")} />
    </WorkspaceShell>
  );
}
