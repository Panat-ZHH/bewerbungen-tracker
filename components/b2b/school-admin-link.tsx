"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Building2, ChevronRight } from "lucide-react";
import { getMySchools } from "@/lib/b2b/client";
import { cn } from "@/lib/utils";
import { useAccess } from "@/components/access/access-provider";
import { isServerAccess } from "@/lib/access/gate";

/** Link to /schul-admin, shown only to users who administer at least one school (and only if the B2B tables exist). */
export function SchoolAdminLink({ className }: { className?: string }) {
  const [name, setName] = useState<string | null>(null);
  const { access } = useAccess();
  useEffect(() => {
    let alive = true;
    getMySchools().then((s) => { if (alive && s && s.length > 0) setName(s.length === 1 ? s[0].name : `${s.length} Schulen`); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  if (!name) return null;
  // /schul-admin only opens for access.role === "school_admin" (app/schul-admin/page.tsx). A teacher who also administers a school
  // would bounce straight back, so no dead link until the page gate is widened (schule-04, BUGS.md).
  if (isServerAccess(access) && access.role !== "school_admin") return null;
  return (
    <Link href="/schul-admin" className={cn("row-link panel-flat group justify-between gap-3 px-4", className)}>
      <span className="flex min-w-0 items-center gap-3"><Building2 size={20} aria-hidden className="shrink-0" /><span className="min-w-0"><span className="block text-sm font-bold">Schuladministration</span><span className="text-small block truncate text-muted">Lizenz und Nutzung: {name}</span></span></span>
      <ChevronRight size={18} strokeWidth={2.4} className="shrink-0 transition-transform group-hover:translate-x-1" aria-hidden />
    </Link>
  );
}
