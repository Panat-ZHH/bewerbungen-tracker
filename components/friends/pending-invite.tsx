"use client";

import { useEffect, useState } from "react";
import { UserPlus, X } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { StatusMessage } from "@/components/ui/skeleton";
import { findUserByCode, sendFriendRequest } from "@/lib/social";
import type { SocialLookup } from "@/types";
import { clearPendingInvite, friendlyError, readPendingInvite } from "./shared";

/** Offers to add the person from an invite link that was opened before login. */
export function PendingInvite({ onChanged }: { onChanged: () => void }) {
  const [code, setCode] = useState<string | null>(null);
  const [inviter, setInviter] = useState<SocialLookup | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const stored = readPendingInvite();
    if (!stored) return;
    let alive = true;
    findUserByCode(stored)
      .then((found) => {
        if (!alive) return;
        if (!found || found.relation !== "none") { clearPendingInvite(); return; }
        setCode(stored);
        setInviter(found);
      })
      .catch(() => { /* stays hidden, the user can still add by code */ });
    return () => { alive = false; };
  }, []);

  if (!code || !inviter) return null;

  async function accept() {
    setBusy(true); setError("");
    try {
      await sendFriendRequest(code!);
      clearPendingInvite(); setInviter(null); onChanged();
    } catch (reason) {
      setError(friendlyError(reason));
    } finally { setBusy(false); }
  }

  return (
    // Cut-out coupon: dashed ink contour, no shadow (the invite card stays the only loud sticker).
    <div className="animate-rise rounded-[var(--radius-xl)] border-2 border-dashed border-[var(--outline)] p-4">
      <div className="flex items-center gap-3">
        <Avatar name={inviter.displayName} size="md" />
        <p className="min-w-0 flex-1 text-body"><strong className="font-semibold">{inviter.displayName}</strong> hat dich eingeladen. Möchtest du befreundet sein?</p>
        <button type="button" aria-label="Einladung verwerfen" onClick={() => { clearPendingInvite(); setInviter(null); }} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-[var(--hover)] hover:text-[var(--ink)] active:translate-y-px"><X size={16} /></button>
      </div>
      <Button variant="sun" className="mt-3" full loading={busy} onClick={accept} icon={<UserPlus size={16} />}>Als Freund hinzufügen</Button>
      {error && <StatusMessage tone="danger" className="mt-3">{error}</StatusMessage>}
    </div>
  );
}
