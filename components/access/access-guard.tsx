"use client";

import { usePathname } from "next/navigation";
import { accessView } from "@/lib/access/gate";
import { AccessProvider, useAccess } from "./access-provider";
import { AccessGatePage } from "./access-pages";

/** For full-screen pages outside the WorkspaceShell (/onboarding): shows the paywall / licence gate / blocked page instead. */
export function AccessGuard({ children }: { children: React.ReactNode }) {
  return <AccessProvider><Inner>{children}</Inner></AccessProvider>;
}

function Inner({ children }: { children: React.ReactNode }) {
  const { access } = useAccess();
  const view = accessView(access, usePathname());
  if (view === "page") return <>{children}</>;
  return <main className="workspace-bg min-h-[100dvh] px-4 py-8 sm:px-6"><AccessGatePage view={view} access={access} /></main>;
}
