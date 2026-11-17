"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { InAppCheckout } from "@/components/billing/in-app-checkout";
import { readPayParams } from "@/components/billing/logic";
import { useAccountKind } from "@/components/settings/account-kind";
import { Skeleton } from "@/components/ui/skeleton";

/** In-app payment of the family package (Payment Element in the app's design). Parents only; the API re-checks. */
export default function Page() {
  return (
    <WorkspaceShell active="Familie">
      <ParentsOnly />
    </WorkspaceShell>
  );
}

/**
 * Pupils (legacy links) go to /familie instead of a half-working payment page (schueler-24). A parent without a complete link
 * (no ?familie=) goes to the purchase form on /familie#abo instead of «Dieser Link ist unvollständig» (eltern-13). UI routing only.
 */
function ParentsOnly() {
  const kind = useAccountKind();
  const router = useRouter();
  const [incomplete] = useState(() => typeof window !== "undefined" && !readPayParams(window.location.search).familyId);
  useEffect(() => {
    if (kind && kind !== "parent") router.replace("/familie");
    else if (kind === "parent" && incomplete) router.replace("/familie#abo");
  }, [kind, router, incomplete]);
  if (kind !== "parent" || incomplete) return <Skeleton className="h-40 rounded-[var(--radius-lg)]" />;
  return <InAppCheckout />;
}
