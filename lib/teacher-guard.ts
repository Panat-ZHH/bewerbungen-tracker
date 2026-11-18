import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { listMyClasses } from "@/lib/classes";
import { loadMyRole, ONBOARDING_PATH, teacherOnboarded } from "@/lib/role";
import { loadMyAccess } from "@/lib/access/client";

/**
 * Starts the guard's reads in parallel: the auth server check plus, for the user of the local session, role, access and
 * (only when the onboarding check will need it) the class list. Errors behave as before (role/access fall back inside their
 * helpers, the class list to null, the auth check rejects into the guard's catch).
 */
export function guardReads(sessionUser: User | null, pathname: string) {
  const verified = supabase.auth.getUser();
  if (!sessionUser) return { verified, userId: null, role: null, access: null, classes: null };
  const role = loadMyRole(sessionUser);
  const access = loadMyAccess({ userId: sessionUser.id });
  const classes = pathname !== ONBOARDING_PATH && !teacherOnboarded(sessionUser.user_metadata) ? listMyClasses().catch(() => null) : null;
  // Read failures surface when (and only when) the guard awaits them, like before.
  role.catch(() => undefined); access.catch(() => undefined);
  return { verified, userId: sessionUser.id, role, access, classes };
}

