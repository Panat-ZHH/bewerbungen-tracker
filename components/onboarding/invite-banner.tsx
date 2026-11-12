"use client";

import { useEffect, useState } from "react";
import { GraduationCap, UserPlus } from "lucide-react";
import { readPendingInviteEntry } from "@/components/friends/shared";
import { inviteSentence, loadInviteContext } from "@/lib/onboarding";

/** Code of a class invitation the visitor is coming from: /login?next=/classes/join/<code> or a stored pending invite. */
function inviteSource(): { kind: "class" | "friend"; code: string } | null {
  const next = new URLSearchParams(window.location.search).get("next") ?? "";
  const match = /^\/classes\/join\/([^/?#]+)/.exec(next);
  if (match) { try { return { kind: "class", code: decodeURIComponent(match[1]) }; } catch { return null; } }
  return readPendingInviteEntry();
}

/** "Du wurdest von Frau X in Klasse Y eingeladen" – only data the public RPC returns (teacher name + class name). */
export function InviteBanner() {
  const [text, setText] = useState("");
  const [friend, setFriend] = useState(false);

  useEffect(() => {
    const source = inviteSource();
    if (!source) return;
    let alive = true;
    if (source.kind === "friend") { setFriend(true); return; } // eslint-disable-line react-hooks/set-state-in-effect -- storage is only readable after hydration
    loadInviteContext(source.code).then((ctx) => { if (alive && ctx) setText(inviteSentence(ctx.teacherName, ctx.className)); });
    return () => { alive = false; };
  }, []);

  if (!text && !friend) return null;
  const Icon = friend ? UserPlus : GraduationCap;
  return (
    <div role="status" className="animate-sticker mb-6 flex items-start gap-3 rounded-[var(--radius-lg)] border-[length:var(--border-w)] border-[var(--outline-fill)] bg-[var(--sun)] p-4 text-left text-[var(--on-sun)] shadow-[var(--shadow-sm)] [--tilt:-1deg]">
      <Icon size={22} strokeWidth={2.2} aria-hidden className="mt-0.5 shrink-0" />
      <div className="text-sm">
        <p className="font-bold">{friend ? "Du wurdest zu WendApply eingeladen" : text}</p>
        <p className="mt-0.5">{friend ? "Melde dich an oder erstelle ein Konto, dann geht es direkt weiter." : "Melde dich an oder erstelle ein Konto. Danach kannst du beitreten und selbst entscheiden, was du teilst."}</p>
      </div>
    </div>
  );
}
