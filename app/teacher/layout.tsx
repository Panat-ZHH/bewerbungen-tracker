"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { listMyClasses } from "@/lib/classes";
import { guardRedirect, loadMyRole, needsRoleChoice, ONBOARDING_PATH, rolePickerHref, teacherOnboarded } from "@/lib/role";
import { supabase } from "@/lib/supabase";
import { loadMyAccess } from "@/lib/access/client";
import { accessView, LICENCE_PATH } from "@/lib/access/gate";
import { Blocked } from "@/components/access/access-pages";
import { guardReads } from "@/lib/teacher-guard";

/**
 * Guard for /teacher/**: logged out -> login, no role yet -> role picker, student -> /dashboard,
 * teacher who never finished onboarding (no flag, no class) -> /teacher/onboarding, no school licence (enforced) -> /schullizenz,
 * blocked -> "Konto gesperrt".
 */
export default function TeacherLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname() ?? "/teacher";
  const [allowed, setAllowed] = useState(false);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      // Perf (reel waterfall, 2026-11-18): the reads below used to run one after another (auth server → profile → my_access →
      // classes, 4 round trips before the page could start). They are independent, so they start together for the user of the
      // local session; the checks are still evaluated in exactly the same order, on the auth server's answer.
      const reads = guardReads((await supabase.auth.getSession()).data.session?.user ?? null, pathname);
      const { data } = await reads.verified;
      const user = data.user;
      if (!user) { router.replace(`/login?next=${encodeURIComponent(pathname)}`); return; }
      if (needsRoleChoice(user)) { router.replace(rolePickerHref(pathname)); return; }
      const same = reads.userId === user.id; // otherwise (session changed meanwhile) read again for the verified user
      const { role } = await (same && reads.role ? reads.role : loadMyRole(user));
      const target = guardRedirect(role, pathname);
      if (target) { router.replace(target); return; }
      // Licence gate (SPEC §1): teachers / school admins without a valid school licence never reach the teacher area.
      const view = accessView(await (same && reads.access ? reads.access : loadMyAccess({ userId: user.id })), pathname);
      if (view === "licence" || view === "paywall") { router.replace(LICENCE_PATH); return; }
      if (view === "blocked") { if (alive) setBlocked(true); return; }
      if (pathname !== ONBOARDING_PATH && !teacherOnboarded(user.user_metadata)) {
        const classes = await (same && reads.classes ? reads.classes : listMyClasses().catch(() => null));
        if (classes && classes.length === 0) { router.replace(ONBOARDING_PATH); return; }
      }
      if (alive) setAllowed(true);
    })().catch(() => { if (alive) setAllowed(true); });
    return () => { alive = false; };
  }, [pathname, router]);

  if (blocked) return <main className="workspace-bg min-h-[100dvh] px-4 py-8"><Blocked /></main>;
  if (!allowed) return <main className="workspace-bg flex min-h-[100dvh] items-center justify-center" aria-busy="true"><p role="status" className="text-sm text-muted">Dein Bereich wird geladen …</p></main>;
  return <>{children}</>;
}
