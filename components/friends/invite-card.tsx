"use client";

import { useState } from "react";
import { Check, Copy, Link2, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { inviteLink } from "@/lib/social";
import type { SocialProfile } from "@/types";

export function InviteCard({ profile }: { profile: SocialProfile }) {
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const [note, setNote] = useState("");
  const link = inviteLink(profile.inviteCode);
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  async function copy(kind: "code" | "link") {
    try {
      await navigator.clipboard.writeText(kind === "code" ? profile.inviteCode : link);
      setCopied(kind);
      setNote(kind === "code" ? "Code kopiert." : "Link kopiert.");
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      setNote("Kopieren ging nicht. Markiere den Text und kopiere ihn von Hand.");
    }
  }

  async function share() {
    try {
      await navigator.share({ title: "WendApply", text: `Komm zu WendApply und lass uns gemeinsam dranbleiben. Mein Code: ${profile.inviteCode}`, url: link });
    } catch (reason) {
      if ((reason as { name?: string })?.name !== "AbortError") setNote("Teilen ging nicht. Kopiere den Link stattdessen.");
    }
  }

  return (
    <Card className="animate-rise overflow-hidden">
      <CardContent className="space-y-4">
        <div>
          <p className="text-eyebrow">Dein Einladungscode</p>
          <p className="tabular text-gradient mt-2 select-all break-all font-mono text-[2rem] font-bold leading-none tracking-[.14em] sm:text-[2.4rem]">{profile.inviteCode}</p>
          <p className="mt-2 text-small text-muted">Wer deinen Code kennt, kann dir eine Freundschaftsanfrage schicken.</p>
        </div>
        <div className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--line)] bg-white/60 px-3 py-2">
          <Link2 size={15} className="shrink-0 text-muted" aria-hidden />
          <span className="min-w-0 flex-1 select-all truncate text-small">{link}</span>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <Button variant="secondary" onClick={() => copy("code")} icon={copied === "code" ? <Check size={16} /> : <Copy size={16} />}>Code kopieren</Button>
          <Button variant="secondary" onClick={() => copy("link")} icon={copied === "link" ? <Check size={16} /> : <Link2 size={16} />}>Link kopieren</Button>
          {canShare && <Button className="col-span-2 sm:col-span-1" onClick={share} icon={<Share2 size={16} />}>Teilen</Button>}
        </div>
        <p className="min-h-4 text-small text-muted" role="status" aria-live="polite">{note}</p>
      </CardContent>
    </Card>
  );
}
