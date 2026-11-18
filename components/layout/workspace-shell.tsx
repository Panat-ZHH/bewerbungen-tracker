"use client";

import { BrandMark } from "@/components/ui/brand-mark";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { BarChart3, BriefcaseBusiness, ChevronRight, FileText, GraduationCap, Heart, LayoutDashboard, LogOut, Map, MoreHorizontal, School, Search, Settings, UserRound, Users } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { Avatar } from "@/components/ui/avatar";
import { clearMyAvatarCache, useMyAvatar } from "@/components/ui/use-avatars";
import { FriendRequestsProvider, useFriendRequests } from "@/components/friends/friend-requests-context";
import { RequestBadge } from "@/components/friends/request-badge";
import { NoticeBadge } from "@/components/classes/notice-badge";
import { badgeLabel } from "@/lib/friend-requests";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { isPlaceholderName } from "@/lib/profile-name-utils";
import { signOutEverywhere } from "@/lib/sign-out";
import { clearSnapshots, clearSnapshotsExcept } from "@/lib/snapshot-cache";
import { cachedRole, clearPendingSignup, clearRoleCache, guardRedirect, homeFor, loadMyRole, needsRoleChoice, rolePickerHref, wrongRoleNotice } from "@/lib/role";
import type { UserRole } from "@/types";
import { getMyClassMemberships } from "@/lib/classes";
import { FAMILY_PATH, familyInviteCodeFromPath, loginNextFor, parentGuardRedirect } from "@/lib/family-core";
import { storePendingInvite } from "@/components/friends/shared";
import { NotificationsBell } from "./notifications-bell";
import { AccessProvider, useAccess } from "@/components/access/access-provider";
import { AccessBanner } from "@/components/access/access-banner";
import { AccessGatePage } from "@/components/access/access-pages";
import { clearAccessCache } from "@/lib/access/client";
import { accessView, isParentAccount, isSchoolAdmin } from "@/lib/access/gate";
import { toast } from "@/lib/toast";
import { clearPendingInvite } from "@/components/friends/shared";

type NavItem = { label: string; href: string; icon: typeof Search; keys: string[]; prefixes?: string[] };

const navigation: NavItem[] = [
  { label: "Start", href: "/dashboard", icon: LayoutDashboard, keys: ["Dashboard", "Übersicht", "Start"] },
  { label: "Suchen", href: "/search", icon: Search, keys: ["Suchen"] },
  { label: "Bewerbungen", href: "/applications", icon: BriefcaseBusiness, keys: ["Applications", "Bewerbungen"] },
  { label: "Dorf", href: "/map", icon: Map, keys: ["Map", "Dorf"] },
  { label: "Dokumente", href: "/cvs", icon: FileText, keys: ["CVs", "Lebensläufe", "Dokumente"] },
  { label: "Auswertung", href: "/analytics", icon: BarChart3, keys: ["Analytics", "Analysen", "Auswertung"] },
  { label: "Freunde", href: "/friends", icon: Users, keys: ["Friends", "Freunde"] },
  { label: "Klassen", href: "/classes", icon: GraduationCap, keys: ["Classes", "Klassen"] },
];

/** Teacher menu: Übersicht, Klassen, Profil, Einstellungen (profile/settings live in accountLinks below). */
const teacherNavigation: NavItem[] = [
  { label: "Klassen", href: "/teacher", icon: GraduationCap, keys: ["Übersicht", "Klassen", "Lehrer", "Teacher"], prefixes: ["/teacher"] },
];
const teacherPrimaryHrefs = ["/teacher", "/profile", "/settings"];
/** Family area: in "Mehr" for every student (school students connect their parents too). */
const familyItem: NavItem = { label: "Familie", href: FAMILY_PATH, icon: Heart, keys: ["Familie", "Family"], prefixes: [FAMILY_PATH] };
/** School admins (my_access().role school_admin): their school area. */
const SCHOOL_ADMIN_PATH = "/schul-admin";
const schoolAdminItem: NavItem = { label: "Schule", href: SCHOOL_ADMIN_PATH, icon: School, keys: ["Schuladministration", "Schule"], prefixes: [SCHOOL_ADMIN_PATH] };
/** Parent accounts (account_type parent) only manage their family: Familie, Profil, Einstellungen. */
const parentNavigation: NavItem[] = [familyItem];
/** Items shown directly in the mobile tab bar; everything else goes into the "Mehr" sheet. */
const primaryHrefs = ["/dashboard", "/search", "/applications", "/map", "/friends"];
/** Students who joined a class see "Klassen" in the tab bar instead of "Freunde" (friends then live in "Mehr"). */
const primaryHrefsInClass = ["/dashboard", "/search", "/applications", "/map", "/classes"];
const accountLinks = [
  { label: "Mein Profil", href: "/profile", icon: UserRound, keys: ["Profile", "Profil"] },
  { label: "Einstellungen", href: "/settings", icon: Settings, keys: ["Settings", "Einstellungen"] },
];

/** `fullscreen`: the page owns the whole viewport (map). No page scroll, header hidden on phones (bottom tab bar stays), children fill the remaining space. */
/**
 * Perf (2026-11-17): every page mounts its own shell, so without a cache each in-app navigation showed the full-screen skeleton
 * again until auth.getUser() (a round trip to the auth server), my_access() and social_my_profile() had answered.
 * The user of this tab is kept here: the next page renders at once. The session is read locally (getSession) and verified with
 * the auth server once per page load in the background; a rejected session still ends on /login as before.
 */
let shellUser: User | null = null;
let verifiedOnce = false;
/** "In a class" for the mobile tab bar, per user for this tab (joining / leaving a class reloads the classes page anyway). */
let classCache: { userId: string; inClass: boolean } | null = null;
function rememberUser(user: User | null) {
  // Another account in this tab: forget everything cached for the previous one.
  if (shellUser?.id !== user?.id) { classCache = null; clearMyAvatarCache(); }
  // Device snapshots (reel fix 2): only the current user's may stay; signed out = none (shared school computers).
  if (user) clearSnapshotsExcept(user.id); else clearSnapshots();
  shellUser = user;
  if (!user) verifiedOnce = false;
}

/** Where the shell must send this user instead of `path` (null = stay). Pure, shared by the first render and the role effect. */
function shellTarget(resolved: UserRole, path: string, schoolAdmin: boolean, parentAccount: boolean): string | null {
  // School admins (not teachers) have no student pages: their home is /schul-admin (G6).
  const adminTarget = schoolAdmin && resolved === "student" && guardRedirect("teacher", path) ? "/schul-admin" : null;
  return adminTarget ?? guardRedirect(resolved, path) ?? (resolved === "student" && parentAccount ? parentGuardRedirect(path) : null);
}

export function WorkspaceShell(props: { children: React.ReactNode; active: string; title?: string; fullscreen?: boolean }) {
  return <FriendRequestsProvider enabled><AccessProvider><ShellInner {...props} /></AccessProvider></FriendRequestsProvider>;
}

function ShellInner({ children, active, fullscreen: fullscreenPage = false }: { children: React.ReactNode; active: string; title?: string; fullscreen?: boolean }) {
  const { count: requestCount } = useFriendRequests();
  const { access, loading: accessLoading } = useAccess();
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(shellUser);
  const [checkingSession, setCheckingSession] = useState(!shellUser);
  const [moreOpen, setMoreOpen] = useState(false);
  const myAvatar = useMyAvatar(Boolean(user));
  const [inClass, setInClass] = useState<boolean | null>(() => (shellUser && classCache?.userId === shellUser.id ? classCache.inClass : null));
  const [profileName, setProfileName] = useState(() => (shellUser ? cachedRole(shellUser.id)?.displayName ?? "" : ""));
  // Parent / school admin by server truth once my_access() answered (G20), metadata only as a fallback.
  const parentAccount = isParentAccount(user?.user_metadata, access);
  const schoolAdmin = isSchoolAdmin(access);
  // Paywall / licence gate / blocked (SPEC §6): replaces the page except on allow-listed paths. Only when enforced.
  const gate = accessView(access, pathname, { parent: parentAccount });
  const fullscreen = fullscreenPage && gate === "page";
  // Known user + role + access from the previous page: render right away when this page is allowed (no skeleton between pages).
  const [role, setRole] = useState<UserRole | null>(() => {
    const known = shellUser && !accessLoading && !needsRoleChoice(shellUser) ? cachedRole(shellUser.id) : null;
    return known && !shellTarget(known.role, pathname ?? "/", schoolAdmin, parentAccount) ? known.role : null;
  });

  useEffect(() => {
    let mounted = true;
    // Local session first (no network): the page can start at once.
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      const local = data.session?.user ?? null;
      rememberUser(local);
      setUser(local);
      setCheckingSession(false);
      if (local) void loadMyRole(local).catch(() => undefined); // in parallel with my_access()
      if (!local || verifiedOnce) return;
      verifiedOnce = true;
      // Once per page load: does the auth server still accept this session (signed out elsewhere, user deleted)? A network
      // error keeps the user (offline); a refused session goes to /login exactly like before.
      supabase.auth.getUser().then(({ data: fresh, error }) => {
        if (fresh.user) { rememberUser(fresh.user); if (mounted) setUser(fresh.user); return; }
        if (error?.name === "AuthRetryableFetchError") { verifiedOnce = false; return; }
        rememberUser(null);
        if (mounted) setUser(null);
      }).catch(() => { verifiedOnce = false; });
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => { const next = session?.user ?? null; rememberUser(next); setUser(next); });
    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (checkingSession || user) return;
    clearSnapshots(); // session missing or refused by the auth server: nothing of the last user may be shown again
    // Keep the query and hash (e.g. /familie?plan=family&interval=month#abo) and remember a family invite across signup.
    const next = loginNextFor(pathname, window.location.search, window.location.hash);
    const familyCode = familyInviteCodeFromPath(pathname);
    if (familyCode) storePendingInvite(familyCode, "family");
    router.replace(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  }, [checkingSession, pathname, router, user]);

  // Resolve the role once per user, ask once if there is none yet, and keep each role on its own pages.
  useEffect(() => {
    if (!user || accessLoading) return;
    // Settings (export / delete) stay reachable before a role was chosen (G10).
    if (needsRoleChoice(user) && !(pathname ?? "").startsWith("/settings")) { router.replace(rolePickerHref(pathname)); return; }
    let alive = true;
    loadMyRole(user).then(({ role: resolved, displayName: name }) => {
      if (!alive) return;
      setProfileName(name);
      const path = pathname ?? "/";
      const target = shellTarget(resolved, path, schoolAdmin, parentAccount);
      if (target) {
        // A class link opened by a parent / a family link opened by a teacher: say why instead of a silent redirect (G16).
        const notice = wrongRoleNotice(resolved === "teacher" ? "teacher" : parentAccount ? "parent" : "student", path);
        if (notice) toast({ message: notice, tone: "info", duration: 8000 });
        setRole(null);
        router.replace(target);
      } else setRole(resolved);
    });
    return () => { alive = false; };
  }, [user, pathname, router, accessLoading, schoolAdmin, parentAccount]);

  // Students in at least one class get "Klassen" in the mobile tab bar.
  useEffect(() => {
    if (!user || role !== "student" || parentAccount) return;
    let alive = true;
    if (classCache?.userId === user.id) return; // known from the previous page (initial state)
    getMyClassMemberships().then((list) => { classCache = { userId: user.id, inClass: list.length > 0 }; if (alive) setInClass(list.length > 0); }).catch(() => {});
    return () => { alive = false; };
  }, [user, role, parentAccount]);

  // Fullscreen pages (map): the document itself must never scroll or rubber-band.
  useEffect(() => {
    if (!fullscreen) return;
    const html = document.documentElement;
    const body = document.body;
    const previous = [html.style.overflow, html.style.overscrollBehavior, body.style.overflow, body.style.overscrollBehavior];
    html.dataset.fullscreen = "true";
    html.style.overflow = "hidden"; html.style.overscrollBehavior = "none";
    body.style.overflow = "hidden"; body.style.overscrollBehavior = "none";
    window.scrollTo(0, 0);
    return () => {
      delete html.dataset.fullscreen;
      [html.style.overflow, html.style.overscrollBehavior, body.style.overflow, body.style.overscrollBehavior] = previous;
    };
  }, [fullscreen]);

  async function logout() {
    setMoreOpen(false);
    await signOutEverywhere(supabase.auth); // also clears the device snapshots
    clearSnapshots();
    clearRoleCache();
    clearAccessCache();
    rememberUser(null);
    classCache = null;
    clearMyAvatarCache();
    // Another person may sign in on this device next: forget invites / signup choices (G26).
    clearPendingInvite();
    clearPendingSignup();
    router.replace("/login");
  }

  if (checkingSession || !user || !role || accessLoading) {
    return (
      <main className="workspace-bg flex min-h-[100dvh] flex-col items-center justify-center gap-5 px-5" aria-busy="true">
        <BrandMark size={56} className="animate-wiggle" priority />
        <div className="w-full max-w-[260px] space-y-2.5" role="status">
          <Skeleton className="h-3.5" />
          <Skeleton className="mx-auto h-3.5 w-2/3" />
          <span className="sr-only">Dein Bereich wird geladen …</span>
        </div>
      </main>
    );
  }

  const displayName = (isPlaceholderName(profileName, user.email) ? undefined : profileName) ?? (user.user_metadata?.full_name as string | undefined) ?? (user.user_metadata?.name as string | undefined) ?? user.email ?? "";
  const isTeacher = role === "teacher";
  const isParent = !isTeacher && parentAccount;
  const isAdminOnly = !isTeacher && !isParent && schoolAdmin;
  // Parents get the compact menu (like teachers); every student finds "Familie" under "Mehr" (desktop: in the sidebar).
  const studentNav = [...navigation, familyItem];
  const compact = isTeacher || isParent || isAdminOnly;
  const compactNav = isTeacher ? (schoolAdmin ? [...teacherNavigation, schoolAdminItem] : teacherNavigation) : isAdminOnly ? [schoolAdminItem] : parentNavigation;
  const items = compact ? compactNav : studentNav;
  const accountItems: NavItem[] = compact ? [{ ...accountLinks[0], keys: [...accountLinks[0].keys] }, { ...accountLinks[1], keys: [...accountLinks[1].keys] }] : accountLinks;
  const isSelected = (item: NavItem) => item.keys.includes(active) || ((compact || item.href === FAMILY_PATH) && (item.prefixes ?? [item.href]).some((prefix) => pathname === prefix || pathname?.startsWith(`${prefix}/`)));
  const mobileAll = compact ? [...compactNav, ...accountItems] : studentNav;
  const studentPrimary = inClass ? primaryHrefsInClass : primaryHrefs;
  const primary = compact ? mobileAll.filter((item) => [...teacherPrimaryHrefs, FAMILY_PATH, SCHOOL_ADMIN_PATH].includes(item.href)) : studentNav.filter((item) => studentPrimary.includes(item.href));
  const more = compact ? [] : studentNav.filter((item) => !studentPrimary.includes(item.href));
  const moreList = compact ? [] : [...more, ...accountLinks];
  const moreActive = moreList.some(isSelected);
  const home = isParent ? FAMILY_PATH : isAdminOnly ? SCHOOL_ADMIN_PATH : homeFor(role);

  return (
    <div className={fullscreen ? "workspace-bg flex h-[100dvh] flex-col overflow-hidden" : "workspace-bg min-h-[100dvh]"}>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[200] focus:rounded-full focus:border-[length:var(--border-w)] focus:border-[var(--outline-fill)] focus:bg-[var(--sun)] focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-[var(--on-sun)] focus:shadow-[var(--shadow-sm)]">Zum Inhalt springen</a>

      <header className={`app-bar app-bar-top sticky top-0 z-30 shrink-0 ${fullscreen ? "max-md:hidden" : ""}`}>
        <div className="page-wrap flex h-[var(--nav-h)] items-center gap-3 md:gap-5">
          <Link href={home} className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg transition-transform active:translate-y-0.5" aria-label="WendApply Start">
            <BrandMark size={38} priority />
            <span className="font-display text-[19px] font-extrabold tracking-[-.03em]">WendApply</span>
          </Link>

          <nav aria-label="Hauptmenü" className="hidden min-w-0 flex-1 items-center gap-0.5 overflow-x-auto [scrollbar-width:none] md:flex">
            {items.map((item) => {
              const { label, href, icon: Icon } = item;
              const selected = isSelected(item);
              return (
                <Link
                  key={href}
                  href={href}
                  title={label}
                  aria-label={href === "/friends" && requestCount > 0 ? `${label}, ${badgeLabel(requestCount)}` : label}
                  aria-current={selected ? "page" : undefined}
                  className={`relative flex h-11 shrink-0 items-center justify-center gap-2 rounded-full border-[length:var(--border-w)] px-3 xl:px-3.5 text-[13.5px] pointer-coarse:h-11 pointer-coarse:min-w-11 font-semibold transition-colors duration-150 active:translate-y-px ${selected ? "border-[var(--outline-fill)] bg-[var(--sun)] text-[var(--on-sun)] shadow-[var(--shadow-xs)]" : "border-transparent text-[var(--ink)] hover:bg-[var(--hover)]"}`}
                >
                  <Icon size={17} strokeWidth={2.1} className="xl:hidden" />
                  <span className="hidden xl:inline">{label}</span>
                  {href === "/friends" && <RequestBadge count={requestCount} className="-right-0.5 -top-0.5" />}
                  <NoticeBadge enabled={!isTeacher && href === "/classes"} className="-right-0.5 -top-0.5" />
                </Link>
              );
            })}
          </nav>
          <div className="flex-1 md:hidden" />

          <div className="flex shrink-0 items-center gap-1">
            {!compact && <NotificationsBell />}
            <Link href="/settings" aria-label="Einstellungen" title="Einstellungen" className="hidden h-11 w-11 items-center justify-center rounded-full text-[var(--ink)] transition-colors hover:bg-[var(--hover)] md:flex">
              <Settings size={18} strokeWidth={2} />
            </Link>
            <button onClick={logout} aria-label="Abmelden" title="Abmelden" className="hidden h-11 w-11 items-center justify-center rounded-full text-[var(--ink)] transition-colors hover:bg-[var(--hover)] md:flex">
              <LogOut size={18} strokeWidth={2} />
            </button>
            <Link href="/profile" aria-label="Mein Profil" title="Mein Profil" aria-current={accountLinks[0].keys.includes(active) ? "page" : undefined} className="flex h-11 w-11 items-center justify-center rounded-full transition-transform active:translate-y-0.5">
              <Avatar name={displayName} src={myAvatar} size="sm" />
            </Link>
          </div>
        </div>
      </header>

      {gate !== "page" ? (
        <main id="main" className="page-wrap pb-safe pt-6 md:pb-12 md:pt-10"><AccessGatePage view={gate} access={access} email={user.email} /></main>
      ) : fullscreen ? (
        <main id="main" className="relative min-h-0 flex-1 max-md:mb-[calc(var(--tabbar-h)+var(--safe-bottom))]">{children}</main>
      ) : (
        <main id="main" className="page-wrap pb-safe pt-6 md:pb-12 md:pt-10">{!/^\/(abo|familie\/bezahlen)(\/|$)/.test(pathname ?? "") && <AccessBanner access={access} parent={parentAccount} />}{children}</main>
      )}

      <nav aria-label="Hauptmenü mobil" className="app-bar app-bar-bottom fixed inset-x-0 bottom-0 z-30 md:hidden" style={{ paddingBottom: "var(--safe-bottom)" }}>
        <ul className="mx-auto flex h-[var(--tabbar-h)] max-w-xl items-stretch px-1">
          {primary.map((item) => {
            const { label, href, icon: Icon } = item;
            const selected = isSelected(item);
            return (
              <li key={href} className="flex-1">
                <Link href={href} aria-label={href === "/friends" && requestCount > 0 ? `${label}, ${badgeLabel(requestCount)}` : undefined} aria-current={selected ? "page" : undefined} className={`group flex h-full flex-col items-center justify-center gap-0.5 text-[10.5px] max-[340px]:text-[9.5px] tracking-tight transition-transform active:translate-y-0.5 ${selected ? "font-bold text-[var(--ink)]" : "font-medium text-[var(--muted)]"}`}>
                  <span className={`relative flex h-7 w-12 items-center justify-center rounded-full border-[length:var(--border-w)] transition-colors duration-150 ${selected ? "border-[var(--outline-fill)] bg-[var(--sun)] text-[var(--on-sun)] shadow-[var(--shadow-xs)]" : "border-transparent group-active:bg-[var(--hover)]"}`}><Icon size={19} strokeWidth={selected ? 2.3 : 1.9} />{href === "/friends" && <RequestBadge count={requestCount} className="-top-1 right-0" />}<NoticeBadge enabled={!isTeacher && href === "/classes"} className="-top-1 right-0" /></span>
                  <span className="max-w-full truncate max-[340px]:text-[9.5px]">{label}</span>
                </Link>
              </li>
            );
          })}
          <li className="min-w-0 flex-1">
            <button type="button" onClick={() => setMoreOpen(true)} aria-haspopup="dialog" aria-expanded={moreOpen} className={`group flex h-full w-full flex-col items-center justify-center gap-0.5 text-[10.5px] transition-transform active:translate-y-0.5 ${moreActive ? "font-bold text-[var(--ink)]" : "font-medium text-[var(--muted)]"}`}>
              <span className={`relative flex h-7 w-12 items-center justify-center rounded-full border-[length:var(--border-w)] transition-colors duration-150 ${moreActive ? "border-[var(--outline-fill)] bg-[var(--sun)] text-[var(--on-sun)] shadow-[var(--shadow-xs)]" : "border-transparent group-active:bg-[var(--hover)]"}`}><MoreHorizontal size={19} strokeWidth={1.9} /><NoticeBadge enabled={!compact && !primary.some((p) => p.href === "/classes")} className="-top-1 right-0" />{inClass && <RequestBadge count={requestCount} className="-top-1 right-0" />}</span>
              <span>Mehr</span>
            </button>
          </li>
        </ul>
      </nav>

      <Modal open={moreOpen} onClose={() => setMoreOpen(false)} title="Mehr">
        <div className="flex items-center gap-3 pb-4">
          <Avatar name={displayName} src={myAvatar} size="lg" className="tilt-l" />
          <div className="min-w-0">
            <p className="font-display truncate text-lg font-bold leading-tight">{isPlaceholderName(profileName, user.email) ? "Hoi!" : `Hoi ${profileName.split(" ")[0]}!`}</p>
            <p className="truncate text-small text-muted">{user.email}</p>
          </div>
        </div>
        <ul className="rows border-y-[length:var(--border-w)] border-dashed border-[var(--line)]">
          {moreList.map((item) => {
            const { label, href, icon: Icon } = item;
            const selected = isSelected(item);
            return (
              <li key={href}>
                <Link href={href} onClick={() => setMoreOpen(false)} aria-current={selected ? "page" : undefined} className="row-link text-[15px] font-semibold">
                  <Icon size={20} strokeWidth={2} className={`shrink-0 ${selected ? "text-[var(--brand)]" : ""}`} />
                  <span className={`truncate ${selected ? "marker" : ""}`}>{label}</span>
                  <span className="relative ml-auto flex items-center"><NoticeBadge enabled={!isTeacher && href === "/classes"} className="-right-1 -top-1" /><ChevronRight size={18} aria-hidden className="text-[var(--muted)]" /></span>
                </Link>
              </li>
            );
          })}
        </ul>
        <button type="button" onClick={logout} className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-full text-sm font-semibold text-[var(--danger-fg)] transition-colors hover:bg-[var(--danger-bg)] active:translate-y-px">
          <LogOut size={17} /> Abmelden
        </button>
      </Modal>
    </div>
  );
}
