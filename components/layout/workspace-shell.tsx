"use client";

import { BrandMark } from "@/components/ui/brand-mark";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { BarChart3, BriefcaseBusiness, FileText, GraduationCap, LayoutDashboard, LogOut, Map, MoreHorizontal, Search, Settings, UserRound, Users } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { Avatar } from "@/components/ui/avatar";
import { useMyAvatar } from "@/components/ui/use-avatars";
import { FriendRequestsProvider, useFriendRequests } from "@/components/friends/friend-requests-context";
import { RequestBadge } from "@/components/friends/request-badge";
import { NoticeBadge } from "@/components/classes/notice-badge";
import { badgeLabel } from "@/lib/friend-requests";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { guardRedirect, homeFor, loadMyRole, needsRoleChoice, rolePickerHref } from "@/lib/role";
import type { UserRole } from "@/types";
import { getMyClassMemberships } from "@/lib/classes";
import { NotificationsBell } from "./notifications-bell";

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
/** Items shown directly in the mobile tab bar; everything else goes into the "Mehr" sheet. */
const primaryHrefs = ["/dashboard", "/search", "/applications", "/map", "/friends"];
/** Students who joined a class see "Klassen" in the tab bar instead of "Freunde" (friends then live in "Mehr"). */
const primaryHrefsInClass = ["/dashboard", "/search", "/applications", "/map", "/classes"];
const accountLinks = [
  { label: "Mein Profil", href: "/profile", icon: UserRound, keys: ["Profile", "Profil"] },
  { label: "Einstellungen", href: "/settings", icon: Settings, keys: ["Settings", "Einstellungen"] },
];

/** `fullscreen`: the page owns the whole viewport (map). No page scroll, header hidden on phones (bottom tab bar stays), children fill the remaining space. */
export function WorkspaceShell(props: { children: React.ReactNode; active: string; title?: string; fullscreen?: boolean }) {
  return <FriendRequestsProvider enabled><ShellInner {...props} /></FriendRequestsProvider>;
}

function ShellInner({ children, active, fullscreen = false }: { children: React.ReactNode; active: string; title?: string; fullscreen?: boolean }) {
  const { count: requestCount } = useFriendRequests();
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [moreOpen, setMoreOpen] = useState(false);
  const myAvatar = useMyAvatar(Boolean(user));
  const [role, setRole] = useState<UserRole | null>(null);
  const [inClass, setInClass] = useState(false);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getUser().then(({ data }) => {
      if (mounted) {
        setUser(data.user);
        setCheckingSession(false);
      }
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null));
    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!checkingSession && !user) router.replace(pathname && pathname !== "/dashboard" ? `/login?next=${encodeURIComponent(pathname)}` : "/login");
  }, [checkingSession, pathname, router, user]);

  // Resolve the role once per user, ask once if there is none yet, and keep each role on its own pages.
  useEffect(() => {
    if (!user) return;
    if (needsRoleChoice(user)) { router.replace(rolePickerHref(pathname)); return; }
    let alive = true;
    loadMyRole(user).then(({ role: resolved }) => {
      if (!alive) return;
      const target = guardRedirect(resolved, pathname ?? "/");
      if (target) router.replace(target); else setRole(resolved);
    });
    return () => { alive = false; };
  }, [user, pathname, router]);

  // Students in at least one class get "Klassen" in the mobile tab bar.
  useEffect(() => {
    if (!user || role !== "student") return;
    let alive = true;
    getMyClassMemberships().then((list) => { if (alive) setInClass(list.length > 0); }).catch(() => {});
    return () => { alive = false; };
  }, [user, role]);

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
    await supabase.auth.signOut();
    router.replace("/login");
  }

  if (checkingSession || !user || !role) {
    return (
      <main className="workspace-bg flex min-h-[100dvh] flex-col items-center justify-center gap-5 px-5" aria-busy="true">
        <BrandMark size={48} radius={14} className="animate-pulse" priority />
        <div className="w-full max-w-[260px] space-y-2.5" role="status">
          <Skeleton className="h-3.5" />
          <Skeleton className="mx-auto h-3.5 w-2/3" />
          <span className="sr-only">Dein Bereich wird geladen …</span>
        </div>
      </main>
    );
  }

  const displayName = (user.user_metadata?.full_name as string | undefined) ?? (user.user_metadata?.name as string | undefined) ?? user.email ?? "";
  const isTeacher = role === "teacher";
  const items = isTeacher ? teacherNavigation : navigation;
  const accountItems: NavItem[] = isTeacher ? [{ ...accountLinks[0], keys: [...accountLinks[0].keys] }, { ...accountLinks[1], keys: [...accountLinks[1].keys] }] : accountLinks;
  const isSelected = (item: NavItem) => item.keys.includes(active) || (isTeacher && (item.prefixes ?? [item.href]).some((prefix) => pathname === prefix || pathname?.startsWith(`${prefix}/`)));
  const mobileAll = isTeacher ? [...teacherNavigation, ...accountItems] : navigation;
  const studentPrimary = inClass ? primaryHrefsInClass : primaryHrefs;
  const primary = isTeacher ? mobileAll.filter((item) => teacherPrimaryHrefs.includes(item.href)) : navigation.filter((item) => studentPrimary.includes(item.href));
  const more = isTeacher ? [] : navigation.filter((item) => !studentPrimary.includes(item.href));
  const moreList = isTeacher ? [] : [...more, ...accountLinks];
  const moreActive = moreList.some(isSelected);
  const home = homeFor(role);

  return (
    <div className={fullscreen ? "workspace-bg flex h-[100dvh] flex-col overflow-hidden" : "workspace-bg min-h-[100dvh]"}>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[200] focus:rounded-full focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:shadow-[var(--shadow-md)]">Zum Inhalt springen</a>

      <header className={`glass-bar sticky top-0 z-30 shrink-0 border-b ${fullscreen ? "max-md:hidden" : ""}`}>
        <div className="page-wrap flex h-[var(--nav-h)] items-center gap-3 md:gap-5">
          <Link href={home} className="flex min-h-11 shrink-0 items-center gap-2.5 rounded-xl transition active:scale-[.97]" aria-label="WendApply Start">
            <BrandMark size={36} radius={11} priority />
            <span className="text-[15px] font-semibold tracking-[-.2px]">WendApply</span>
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
                  className={`relative flex h-11 shrink-0 items-center justify-center gap-2 rounded-full px-3 text-[13px] pointer-coarse:h-11 pointer-coarse:min-w-11 font-medium transition duration-200 active:scale-[.96] ${selected ? "bg-[var(--brand-soft)] text-[var(--brand-strong)] shadow-[var(--shadow-xs)]" : "text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--ink)]"}`}
                >
                  <Icon size={16} strokeWidth={1.9} />
                  <span className="hidden xl:inline">{label}</span>
                  {href === "/friends" && <RequestBadge count={requestCount} className="-right-0.5 -top-0.5" />}
                  <NoticeBadge enabled={!isTeacher && href === "/classes"} className="-right-0.5 -top-0.5" />
                </Link>
              );
            })}
          </nav>
          <div className="flex-1 md:hidden" />

          <div className="flex shrink-0 items-center gap-1">
            {!isTeacher && <NotificationsBell />}
            <Link href="/settings" aria-label="Einstellungen" title="Einstellungen" className="hidden h-11 w-11 items-center justify-center rounded-full text-[var(--muted)] transition hover:bg-[var(--hover)] hover:text-[var(--ink)] md:flex">
              <Settings size={17} strokeWidth={1.8} />
            </Link>
            <button onClick={logout} aria-label="Abmelden" title="Abmelden" className="hidden h-11 w-11 items-center justify-center rounded-full text-[var(--muted)] transition hover:bg-[var(--hover)] hover:text-[var(--ink)] md:flex">
              <LogOut size={17} strokeWidth={1.8} />
            </button>
            <Link href="/profile" aria-label="Mein Profil" title="Mein Profil" aria-current={accountLinks[0].keys.includes(active) ? "page" : undefined} className="flex h-11 w-11 items-center justify-center rounded-full transition active:scale-95">
              <Avatar name={displayName} src={myAvatar} size="sm" />
            </Link>
          </div>
        </div>
      </header>

      {fullscreen ? (
        <main id="main" className="relative min-h-0 flex-1 max-md:mb-[calc(var(--tabbar-h)+var(--safe-bottom))]">{children}</main>
      ) : (
        <main id="main" className="page-wrap pb-safe pt-6 md:pb-12 md:pt-10">{children}</main>
      )}

      <nav aria-label="Hauptmenü mobil" className="glass-bar fixed inset-x-0 bottom-0 z-30 border-t md:hidden" style={{ paddingBottom: "var(--safe-bottom)" }}>
        <ul className="mx-auto flex h-[var(--tabbar-h)] max-w-xl items-stretch px-1">
          {primary.map((item) => {
            const { label, href, icon: Icon } = item;
            const selected = isSelected(item);
            return (
              <li key={href} className="min-w-0 flex-1">
                <Link href={href} aria-label={href === "/friends" && requestCount > 0 ? `${label}, ${badgeLabel(requestCount)}` : undefined} aria-current={selected ? "page" : undefined} className={`group flex h-full flex-col items-center justify-center gap-0.5 text-[10.5px] max-[340px]:text-[9.5px] font-medium tracking-tight transition active:scale-95 ${selected ? "text-[var(--brand-strong)]" : "text-[var(--muted)]"}`}>
                  <span className={`relative flex h-7 w-12 items-center justify-center rounded-full transition duration-200 ${selected ? "bg-[var(--brand-soft)]" : "group-active:bg-[var(--hover)]"}`}><Icon size={19} strokeWidth={selected ? 2.2 : 1.8} />{href === "/friends" && <RequestBadge count={requestCount} className="-top-1 right-0" />}<NoticeBadge enabled={!isTeacher && href === "/classes"} className="-top-1 right-0" /></span>
                  <span className="max-w-full truncate max-[340px]:text-[9.5px]">{label}</span>
                </Link>
              </li>
            );
          })}
          <li className="min-w-0 flex-1">
            <button type="button" onClick={() => setMoreOpen(true)} aria-haspopup="dialog" aria-expanded={moreOpen} className={`group flex h-full w-full flex-col items-center justify-center gap-0.5 text-[10.5px] font-medium transition active:scale-95 ${moreActive ? "text-[var(--brand-strong)]" : "text-[var(--muted)]"}`}>
              <span className={`relative flex h-7 w-12 items-center justify-center rounded-full transition duration-200 ${moreActive ? "bg-[var(--brand-soft)]" : "group-active:bg-[var(--hover)]"}`}><MoreHorizontal size={19} strokeWidth={1.9} /><NoticeBadge enabled={!isTeacher && !primary.some((p) => p.href === "/classes")} className="-top-1 right-0" />{inClass && <RequestBadge count={requestCount} className="-top-1 right-0" />}</span>
              <span className="text-[10.5px] font-medium">Mehr</span>
            </button>
          </li>
        </ul>
      </nav>

      <Modal open={moreOpen} onClose={() => setMoreOpen(false)} title="Mehr">
        <div className="mb-4 flex items-center gap-3 rounded-2xl bg-[var(--hover)] p-3">
          <Avatar name={displayName} src={myAvatar} size="md" />
          <p className="min-w-0 truncate text-sm font-medium">{user.email}</p>
        </div>
        <ul className="grid grid-cols-2 gap-2">
          {moreList.map((item) => {
            const { label, href, icon: Icon } = item;
            const selected = isSelected(item);
            return (
              <li key={href}>
                <Link href={href} onClick={() => setMoreOpen(false)} aria-current={selected ? "page" : undefined} className={`flex min-h-14 items-center gap-3 rounded-2xl border px-3.5 text-sm font-medium transition active:scale-[.97] ${selected ? "border-[var(--info-line)] bg-[var(--brand-soft)] text-[var(--brand-strong)]" : "border-[var(--line)] bg-white/60"}`}>
                  <Icon size={18} strokeWidth={1.8} className="shrink-0" />
                  <span className="truncate">{label}</span>
                  <span className="relative ml-auto"><NoticeBadge enabled={!isTeacher && href === "/classes"} className="-right-1 -top-1" /></span>
                </Link>
              </li>
            );
          })}
        </ul>
        <button type="button" onClick={logout} className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-[var(--danger-line)] bg-[var(--danger-bg)] text-sm font-semibold text-[var(--danger-fg)] transition active:scale-[.98]">
          <LogOut size={17} /> Abmelden
        </button>
      </Modal>
    </div>
  );
}
