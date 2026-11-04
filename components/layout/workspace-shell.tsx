"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { BarChart3, BriefcaseBusiness, FileText, GraduationCap, LayoutDashboard, LogOut, Map, MoreHorizontal, Search, Settings, UserRound, Users } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { Avatar } from "@/components/ui/avatar";
import { useMyAvatar } from "@/components/ui/use-avatars";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";

type NavItem = { label: string; href: string; icon: typeof Search; keys: string[] };

const navigation: NavItem[] = [
  { label: "Start", href: "/dashboard", icon: LayoutDashboard, keys: ["Dashboard", "Übersicht", "Start"] },
  { label: "Suchen", href: "/search", icon: Search, keys: ["Suchen"] },
  { label: "Bewerbungen", href: "/applications", icon: BriefcaseBusiness, keys: ["Applications", "Bewerbungen"] },
  { label: "Map", href: "/map", icon: Map, keys: ["Map"] },
  { label: "Lebensläufe", href: "/cvs", icon: FileText, keys: ["CVs", "Lebensläufe"] },
  { label: "Auswertung", href: "/analytics", icon: BarChart3, keys: ["Analytics", "Analysen", "Auswertung"] },
  { label: "Freunde", href: "/friends", icon: Users, keys: ["Friends", "Freunde"] },
  { label: "Klassen", href: "/classes", icon: GraduationCap, keys: ["Classes", "Klassen"] },
];

/** Items shown directly in the mobile tab bar; everything else goes into the "Mehr" sheet. */
const primaryHrefs = ["/dashboard", "/search", "/applications", "/friends"];
const accountLinks = [
  { label: "Mein Profil", href: "/profile", icon: UserRound, keys: ["Profile", "Profil"] },
  { label: "Einstellungen", href: "/settings", icon: Settings, keys: ["Settings", "Einstellungen"] },
];

export function WorkspaceShell({ children, active }: { children: React.ReactNode; active: string; title?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [moreOpen, setMoreOpen] = useState(false);
  const myAvatar = useMyAvatar(Boolean(user));

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

  async function logout() {
    setMoreOpen(false);
    await supabase.auth.signOut();
    router.replace("/login");
  }

  if (checkingSession || !user) {
    return (
      <main className="workspace-bg flex min-h-[100dvh] flex-col items-center justify-center gap-5 px-5" aria-busy="true">
        <Image src="/logo.png" alt="" width={48} height={48} className="animate-pulse rounded-[14px]" priority />
        <div className="w-full max-w-[260px] space-y-2.5" role="status">
          <Skeleton className="h-3.5" />
          <Skeleton className="mx-auto h-3.5 w-2/3" />
          <span className="sr-only">Dein Bereich wird geladen …</span>
        </div>
      </main>
    );
  }

  const displayName = (user.user_metadata?.full_name as string | undefined) ?? (user.user_metadata?.name as string | undefined) ?? user.email ?? "";
  const primary = navigation.filter((item) => primaryHrefs.includes(item.href));
  const more = navigation.filter((item) => !primaryHrefs.includes(item.href));
  const moreActive = [...more, ...accountLinks].some((item) => item.keys.includes(active));

  return (
    <div className="workspace-bg min-h-[100dvh]">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[200] focus:rounded-full focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:shadow-[var(--shadow-md)]">Zum Inhalt springen</a>

      <header className="glass-bar sticky top-0 z-30 border-b">
        <div className="page-wrap flex h-[var(--nav-h)] items-center gap-3 md:gap-5">
          <Link href="/dashboard" className="flex min-h-11 shrink-0 items-center gap-2.5 rounded-xl transition active:scale-[.97]" aria-label="WendApply Start">
            <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-[11px] bg-[#f2f7ff] shadow-[var(--shadow-xs)]">
              <Image src="/logo.png" alt="" width={36} height={36} className="h-9 w-9 object-contain" priority />
            </span>
            <span className="text-[15px] font-semibold tracking-[-.2px]">WendApply</span>
          </Link>

          <nav aria-label="Hauptmenü" className="hidden min-w-0 flex-1 items-center gap-0.5 overflow-x-auto [scrollbar-width:none] md:flex">
            {navigation.map(({ label, href, icon: Icon, keys }) => {
              const selected = keys.includes(active);
              return (
                <Link
                  key={href}
                  href={href}
                  title={label}
                  aria-label={label}
                  aria-current={selected ? "page" : undefined}
                  className={`flex h-9 shrink-0 items-center justify-center gap-2 rounded-full px-3 text-[13px] pointer-coarse:h-11 pointer-coarse:min-w-11 font-medium transition duration-200 active:scale-[.96] ${selected ? "bg-[var(--brand-soft)] text-[var(--brand-strong)] shadow-[var(--shadow-xs)]" : "text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--ink)]"}`}
                >
                  <Icon size={16} strokeWidth={1.9} />
                  <span className="hidden xl:inline">{label}</span>
                </Link>
              );
            })}
          </nav>
          <div className="flex-1 md:hidden" />

          <div className="flex shrink-0 items-center gap-1">
            <Link href="/settings" aria-label="Einstellungen" title="Einstellungen" className="hidden h-9 w-9 items-center justify-center rounded-full text-[var(--muted)] transition hover:bg-[var(--hover)] hover:text-[var(--ink)] md:flex pointer-coarse:h-11 pointer-coarse:w-11">
              <Settings size={17} strokeWidth={1.8} />
            </Link>
            <button onClick={logout} aria-label="Abmelden" title="Abmelden" className="hidden h-9 w-9 items-center justify-center rounded-full text-[var(--muted)] transition hover:bg-[var(--hover)] hover:text-[var(--ink)] md:flex pointer-coarse:h-11 pointer-coarse:w-11">
              <LogOut size={17} strokeWidth={1.8} />
            </button>
            <Link href="/profile" aria-label="Mein Profil" title="Mein Profil" aria-current={accountLinks[0].keys.includes(active) ? "page" : undefined} className="flex h-11 w-11 items-center justify-center rounded-full transition active:scale-95">
              <Avatar name={displayName} src={myAvatar} size="sm" />
            </Link>
          </div>
        </div>
      </header>

      <main id="main" className="page-wrap pb-safe pt-6 md:pb-12 md:pt-10">{children}</main>

      <nav aria-label="Hauptmenü mobil" className="glass-bar fixed inset-x-0 bottom-0 z-30 border-t md:hidden" style={{ paddingBottom: "var(--safe-bottom)" }}>
        <ul className="mx-auto flex h-[var(--tabbar-h)] max-w-xl items-stretch px-1">
          {primary.map(({ label, href, icon: Icon, keys }) => {
            const selected = keys.includes(active);
            return (
              <li key={href} className="min-w-0 flex-1">
                <Link href={href} aria-current={selected ? "page" : undefined} className={`group flex h-full flex-col items-center justify-center gap-0.5 text-[10.5px] font-medium transition active:scale-95 ${selected ? "text-[var(--brand-strong)]" : "text-[var(--muted)]"}`}>
                  <span className={`flex h-7 w-12 items-center justify-center rounded-full transition duration-200 ${selected ? "bg-[var(--brand-soft)]" : "group-active:bg-[var(--hover)]"}`}><Icon size={19} strokeWidth={selected ? 2.2 : 1.8} /></span>
                  <span className="max-w-full truncate">{label}</span>
                </Link>
              </li>
            );
          })}
          <li className="min-w-0 flex-1">
            <button type="button" onClick={() => setMoreOpen(true)} aria-haspopup="dialog" aria-expanded={moreOpen} className={`group flex h-full w-full flex-col items-center justify-center gap-0.5 text-[10.5px] font-medium transition active:scale-95 ${moreActive ? "text-[var(--brand-strong)]" : "text-[var(--muted)]"}`}>
              <span className={`flex h-7 w-12 items-center justify-center rounded-full transition duration-200 ${moreActive ? "bg-[var(--brand-soft)]" : "group-active:bg-[var(--hover)]"}`}><MoreHorizontal size={19} strokeWidth={1.9} /></span>
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
          {[...more, ...accountLinks].map(({ label, href, icon: Icon, keys }) => {
            const selected = keys.includes(active);
            return (
              <li key={href}>
                <Link href={href} onClick={() => setMoreOpen(false)} aria-current={selected ? "page" : undefined} className={`flex min-h-14 items-center gap-3 rounded-2xl border px-3.5 text-sm font-medium transition active:scale-[.97] ${selected ? "border-[var(--info-line)] bg-[var(--brand-soft)] text-[var(--brand-strong)]" : "border-[var(--line)] bg-white/60"}`}>
                  <Icon size={18} strokeWidth={1.8} className="shrink-0" />
                  <span className="truncate">{label}</span>
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
