"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { InAppCheckout } from "@/components/billing/in-app-checkout";
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

/** Pupils (legacy links) go to /familie instead of a half-working payment page (schueler-24). UI routing only. */
function ParentsOnly() {
  const kind = useAccountKind();
  const router = useRouter();
  useEffect(() => { if (kind && kind !== "parent") router.replace("/familie"); }, [kind, router]);
  if (kind !== "parent") return <Skeleton className="h-40 rounded-[var(--radius-lg)]" />;
  return <InAppCheckout />;
}
