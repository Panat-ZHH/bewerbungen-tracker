"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BarChart3, BriefcaseBusiness, FileText, LogOut, Map, Search, Settings, UserRound } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

const navigation = [
  { label: "Start", href: "/dashboard", icon: BriefcaseBusiness, keys: ["Dashboard", "Übersicht", "Start"] },
  { label: "Suchen", href: "/search", icon: Search, keys: ["Suchen"] },
  { label: "Bewerbungen", href: "/applications", icon: BriefcaseBusiness, keys: ["Applications", "Bewerbungen"] },
  { label: "Map", href: "/map", icon: Map, keys: ["Map"] },
  { label: "Lebensläufe", href: "/cvs", icon: FileText, keys: ["CVs", "Lebensläufe"] },
  { label: "Auswertung", href: "/analytics", icon: BarChart3, keys: ["Analytics", "Analysen", "Auswertung"] },
];

export function WorkspaceShell({ children, active }: { children: React.ReactNode; active: string; title?: string }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);

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
    if (!checkingSession && !user) router.replace("/login");
  }, [checkingSession, router, user]);

  async function logout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  if (checkingSession || !user) {
    return (
      <main className="workspace-bg flex min-h-[100dvh] items-center justify-center px-5">
        <p className="text-sm text-muted">Dein Bereich wird geladen …</p>
      </main>
    );
  }

  return (
    <div className="workspace-bg min-h-[100dvh]">
      <header className="glass-bar sticky top-0 z-20 border-b">
        <div className="page-wrap flex h-[68px] items-center gap-5">
          <Link href="/dashboard" className="flex shrink-0 items-center gap-2.5" aria-label="WendApply Start">
            <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-[11px] bg-[#f2f7ff]">
              <Image src="/logo.png" alt="" width={36} height={36} className="h-9 w-9 object-contain" priority />
            </span>
            <span className="hidden text-[15px] font-semibold tracking-[-.2px] sm:inline">WendApply</span>
          </Link>

          <nav aria-label="Hauptmenü" className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
            {navigation.map(({ label, href, icon: Icon, keys }) => {
              const selected = keys.includes(active);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={selected ? "page" : undefined}
                  className={`flex h-9 shrink-0 items-center gap-2 rounded-full px-3 text-[13px] font-medium transition-colors ${selected ? "bg-[#eaf3ff] text-[#075dbd]" : "text-[#5e5e63] hover:bg-[#f2f2f4] hover:text-[#1d1d1f]"}`}
                >
                  <Icon size={15} strokeWidth={1.8} />
                  {label}
                </Link>
              );
            })}
          </nav>

          <div className="flex shrink-0 items-center gap-1">
            <Link href="/profile" aria-label="Mein Profil" title="Mein Profil" className="flex h-9 w-9 items-center justify-center rounded-full text-[#5e5e63] hover:bg-[#f2f2f4]">
              <UserRound size={17} strokeWidth={1.8} />
            </Link>
            <Link href="/settings" aria-label="Einstellungen" title="Einstellungen" className="flex h-9 w-9 items-center justify-center rounded-full text-[#5e5e63] hover:bg-[#f2f2f4]">
              <Settings size={17} strokeWidth={1.8} />
            </Link>
            <button onClick={logout} aria-label="Abmelden" title="Abmelden" className="flex h-9 w-9 items-center justify-center rounded-full text-[#5e5e63] hover:bg-[#f2f2f4]">
              <LogOut size={17} strokeWidth={1.8} />
            </button>
          </div>
        </div>
      </header>
      <main className="page-wrap py-8 md:py-11">{children}</main>
    </div>
  );
}