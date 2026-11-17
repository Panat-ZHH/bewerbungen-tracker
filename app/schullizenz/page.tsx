"use client";

import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { SchoolLicenceView } from "@/components/access/school-licence-view";

/** /schullizenz: licence gate for teachers / school admins (SPEC §1), or the active licence. Allow-listed in the paywall. */
export default function Page() {
  return (
    <WorkspaceShell active="Schullizenz">
      <SchoolLicenceView />
    </WorkspaceShell>
  );
}
