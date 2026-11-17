"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { InAppCheckout } from "@/components/billing/in-app-checkout";
import { readPayParams } from "@/components/billing/logic";
import { useAccountKindInfo } from "@/components/settings/account-kind";
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
  const { kind, confirmed } = useAccountKindInfo();
  const router = useRouter();
  const [incomplete] = useState(() => typeof window !== "undefined" && !readPayParams(window.location.search).familyId);
  // Send away only on a confirmed (server) account type: a parent whose metadata lacks account_type is never bounced (QA M1).
  const away = confirmed && kind !== "parent";
  useEffect(() => {
    if (away) router.replace("/familie");
    else if (kind !== null && incomplete) router.replace("/familie#abo");
  }, [away, kind, router, incomplete]);
  if (kind === null || away || incomplete) return <Skeleton className="h-40 rounded-[var(--radius-lg)]" />;
  // Known parent, or kind not confirmed by the server (metadata fallback): show the checkout, the API re-checks.
  return <InAppCheckout />;
}
