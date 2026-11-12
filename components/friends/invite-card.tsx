"use client";

import { useState } from "react";
import { Check, Copy, Link2, Mail, MessageCircle, QrCode as QrIcon, Share2 } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { DoodleStar } from "@/components/ui/doodles";
import { inviteLink } from "@/lib/social";
import { QrCode } from "./qr-code";
import type { SocialProfile } from "@/types";

export function InviteCard({ profile }: { profile: SocialProfile }) {
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const [note, setNote] = useState("");
  const [showQr, setShowQr] = useState(false);
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

  const message = `Komm zu WendApply, dann bleiben wir beim Bewerben gemeinsam dran: ${link} (Code: ${profile.inviteCode})`;
  const whatsapp = `https://wa.me/?text=${encodeURIComponent(message)}`;
  const mailto = `mailto:?subject=${encodeURIComponent("Bewirb dich mit mir bei WendApply")}&body=${encodeURIComponent(`Hallo!\n\nKomm zu WendApply, dann bleiben wir beim Bewerben gemeinsam dran. Hier ist mein Einladungslink:\n${link}\n\n(Oder gib in der App meinen Code ein: ${profile.inviteCode})`)}`;

  return (
    // THE sticker of the page: flat yellow face, ink contour, hard shadow, a tilted label on the edge.
    <div className="animate-rise relative space-y-4 rounded-[var(--radius-xl)] border-[length:var(--border-w)] border-[var(--outline)] bg-[var(--sun-soft)] p-4 pt-8 shadow-[var(--shadow-md)] sm:p-5 sm:pt-9 lg:rotate-[.6deg]">
      <p className="sticker tilt-l3 absolute -top-3.5 left-3 text-sm">Dein Einladungscode</p>
      <DoodleStar className="absolute right-4 top-3 h-8 w-8 rotate-12 text-[var(--coral)]" />
      <div>
        <p className="font-display tabular select-all break-all pr-10 text-[2.1rem] font-extrabold leading-none tracking-[.08em] sm:text-[2.5rem]">{profile.inviteCode}</p>
        <p className="mt-2 text-small text-muted">Wer deinen Code kennt, kann dir eine Freundschaftsanfrage schicken.</p>
      </div>
      <div className="flex items-center gap-2 border-y-[length:var(--border-w)] border-dashed border-[var(--outline)] py-2.5">
        <Link2 size={15} strokeWidth={2.2} className="shrink-0" aria-hidden />
        <span className="min-w-0 flex-1 select-all truncate text-small font-medium">{link}</span>
      </div>
      <div className="grid grid-cols-2 gap-2.5 sm:flex sm:flex-wrap">
        {canShare && <Button className="col-span-2 min-h-11 sm:col-span-1 sm:min-h-11" onClick={share} icon={<Share2 size={16} />}>Teilen</Button>}
        <ButtonLink href={whatsapp} target="_blank" rel="noopener noreferrer" variant={canShare ? "secondary" : "primary"} className="min-h-11 sm:min-h-11" icon={<MessageCircle size={16} />}>WhatsApp</ButtonLink>
        <Button variant="secondary" className="min-h-11 sm:min-h-11" aria-expanded={showQr} onClick={() => setShowQr(!showQr)} icon={<QrIcon size={16} />}>QR-Code</Button>
        <Button variant="secondary" className="min-h-11 sm:min-h-11" onClick={() => copy("link")} icon={copied === "link" ? <Check size={16} /> : <Link2 size={16} />}>Link kopieren</Button>
        <Button variant="secondary" className="min-h-11 sm:min-h-11" onClick={() => copy("code")} icon={copied === "code" ? <Check size={16} /> : <Copy size={16} />}>Code kopieren</Button>
        <ButtonLink href={mailto} variant="ghost" className="min-h-11 decoration-[var(--outline)] sm:min-h-11" icon={<Mail size={16} />}>Per E-Mail</ButtonLink>
      </div>
      {showQr && (
        <div className="flex flex-col items-center gap-3 pt-1">
          <QrCode value={link} label={`QR-Code für deinen Einladungslink, Code ${profile.inviteCode}`} />
          <p className="text-center text-small text-muted">Lass die andere Person diesen Code mit der Kamera scannen.</p>
        </div>
      )}
      <p className="text-small font-medium empty:sr-only" role="status" aria-live="polite">{note}</p>
    </div>
  );
}
