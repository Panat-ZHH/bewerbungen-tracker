"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { listMyClasses } from "@/lib/classes";
import { guardRedirect, loadMyRole, needsRoleChoice, ONBOARDING_PATH, rolePickerHref, teacherOnboarded } from "@/lib/role";
import { supabase } from "@/lib/supabase";

/**
 * Guard for /teacher/**: logged out -> login, no role yet -> role picker, student -> /dashboard,
 * teacher who never finished onboarding (no flag, no class) -> /teacher/onboarding.
 */
export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname() ?? "/teacher";
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      if (!user) { router.replace(`/login?next=${encodeURIComponent(pathname)}`); return; }
      if (needsRoleChoice(user)) { router.replace(rolePickerHref(pathname)); return; }
      const { role } = await loadMyRole(user);
      const target = guardRedirect(role, pathname);
      if (target) { router.replace(target); return; }
      if (pathname !== ONBOARDING_PATH && !teacherOnboarded(user.user_metadata)) {
        const classes = await listMyClasses().catch(() => null);
        if (classes && classes.length === 0) { router.replace(ONBOARDING_PATH); return; }
      }
      if (alive) setAllowed(true);
    })().catch(() => { if (alive) setAllowed(true); });
    return () => { alive = false; };
  }, [pathname, router]);

  if (!allowed) return <main className="workspace-bg flex min-h-[100dvh] items-center justify-center" aria-busy="true"><p role="status" className="text-sm text-muted">Dein Bereich wird geladen …</p></main>;
  return <>{children}</>;
}
