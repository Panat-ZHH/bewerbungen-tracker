"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { signOutEverywhere } from "@/lib/sign-out";

export function AdminLogout() {
  const [busy, setBusy] = useState(false);
  async function logout() {
    setBusy(true);
    await signOutEverywhere(supabase.auth);
    window.location.replace("/login");
  }
  return (
    <Button variant="secondary" size="sm" onClick={logout} loading={busy} icon={<LogOut size={15} strokeWidth={2.4} aria-hidden />}>
      <span className="hidden sm:inline">Abmelden</span><span className="sr-only sm:hidden">Abmelden</span>
    </Button>
  );
}
