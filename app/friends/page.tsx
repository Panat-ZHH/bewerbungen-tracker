"use client";

import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { FriendsView } from "@/components/friends/friends-view";

export default function FriendsPage() {
  return (
    <WorkspaceShell active="Freunde">
      <FriendsView />
    </WorkspaceShell>
  );
}
