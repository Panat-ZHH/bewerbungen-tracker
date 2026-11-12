"use client";

import { useState } from "react";
import { Check, X } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusMessage } from "@/components/ui/skeleton";
import { removeFriend, respondToFriendRequest } from "@/lib/social";
import type { SocialConnection } from "@/types";
import { friendlyError } from "./shared";

export function Requests({ incoming, outgoing, onChanged }: { incoming: SocialConnection[]; outgoing: SocialConnection[]; onChanged: () => void }) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function run(id: string, action: () => Promise<unknown>) {
    setBusyId(id); setError("");
    try { await action(); onChanged(); } catch (reason) { setError(friendlyError(reason)); } finally { setBusyId(null); }
  }

  if (!incoming.length && !outgoing.length) return null;
  return (
    <section aria-labelledby="requests-title" className="animate-rise">
      <h2 id="requests-title" className="text-heading flex items-center gap-3">Anfragen {incoming.length > 0 && <span className="sticker sticker-coral tilt-r">{incoming.length} neu</span>}</h2>
      {error && <StatusMessage tone="danger" className="mt-3">{error}</StatusMessage>}
      <Card className="rows mt-3 px-4 sm:px-5">
        {incoming.map((c) => (
          <div key={c.id} className="flex flex-wrap items-center gap-3 py-4">
            <Avatar name={c.displayName} />
            <div className="min-w-[10rem] flex-1 basis-[10rem]"><p className="truncate font-bold">{c.displayName}</p><p className="text-small text-muted">möchte mit dir befreundet sein</p></div>
            <div className="flex gap-2.5">
              <Button size="sm" variant="sun" className="min-h-11 sm:min-h-11" loading={busyId === c.id} onClick={() => run(c.id, () => respondToFriendRequest(c.id, true))} icon={<Check size={15} strokeWidth={2.6} />}>Annehmen</Button>
              <Button size="sm" className="min-h-11 sm:min-h-11" variant="secondary" disabled={busyId === c.id} onClick={() => run(c.id, () => respondToFriendRequest(c.id, false))} icon={<X size={15} />}>Ablehnen</Button>
            </div>
          </div>
        ))}
        {outgoing.map((c) => (
          <div key={c.id} className="flex flex-wrap items-center gap-3 py-4">
            <Avatar name={c.displayName} />
            <div className="min-w-0 flex-1"><p className="truncate font-bold">{c.displayName}</p><p className="text-small text-muted">Anfrage gesendet, wartet auf Antwort</p></div>
            <Button size="sm" className="min-h-11 sm:min-h-11" variant="ghost" loading={busyId === c.id} onClick={() => run(c.id, () => removeFriend(c.id))}>Zurückziehen</Button>
          </div>
        ))}
      </Card>
    </section>
  );
}
