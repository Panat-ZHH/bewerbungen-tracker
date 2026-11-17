import type { Metadata } from "next";
import { BrandMark } from "@/components/ui/brand-mark";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { AdminLogout } from "@/components/admin/logout-button";

// Platform admin: never indexed, never cached, not linked from anywhere. Access is decided by /api/admin/* (404 for everyone else).
export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false, noimageindex: true } },
  referrer: "no-referrer",
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="workspace-bg overflow-x-clip">
      <header className="app-bar app-bar-top sticky top-0 z-40">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 sm:px-6">
          <span className="flex items-center gap-2.5">
            <BrandMark size={32} />
            <span className="font-display text-lg font-extrabold">Admin</span>
          </span>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <AdminLogout />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-4 pb-16 pt-6 sm:px-6 sm:pt-8">{children}</main>
    </div>
  );
}
