"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { InAppReturn } from "@/components/billing/in-app-return";
import { readReturnSession } from "@/components/billing/logic";
import { Skeleton } from "@/components/ui/skeleton";

/** Return page after the in-app payment: confirms the payment and shows the active plan. */
export default function Page() {
  return (
    <WorkspaceShell active="Familie">
      <ReturnOrFamily />
    </WorkspaceShell>
  );
}

/** Without ?session_id= there is nothing to confirm: go to /familie instead of «Wir konnten keine Zahlung … finden» (eltern-13). */
function ReturnOrFamily() {
  const router = useRouter();
  const [missing] = useState(() => typeof window !== "undefined" && !readReturnSession(window.location.search));
  useEffect(() => { if (missing) router.replace("/familie"); }, [missing, router]);
  if (missing) return <Skeleton className="h-40 rounded-[var(--radius-lg)]" />;
  return <InAppReturn />;
}
