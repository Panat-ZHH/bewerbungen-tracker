"use client";

import { Flame } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { useAvatarUrls } from "@/components/ui/use-avatars";
import type { FriendActivity, SocialProfile } from "@/types";

/** Friendly strip with the shared progress. No ranking, no points: nobody is compared with anybody. */
export function Motivation({ activity, me }: { activity: FriendActivity[]; me: SocialProfile }) {
  const shared = activity.filter((a) => a.shared);
  const avatars = useAvatarUrls(shared.map((a) => a.userId));
  if (shared.length === 0) return null;
  const total = shared.reduce((sum, a) => sum + (a.total ?? 0), 0);
  return (
    <section aria-labelledby="motivation-title" className="animate-rise panel p-4 sm:p-5">
      <div className="flex items-center gap-2"><Flame size={18} className="text-[var(--warning-fg)]" aria-hidden /><h2 id="motivation-title" className="text-heading">Gemeinsam dranbleiben</h2></div>
      <p className="mt-1 text-small text-muted">{me.displayName}, deine Freunde haben zusammen {total} Bewerbung{total === 1 ? "" : "en"} auf dem Weg. Jede zählt, jeder in seinem Tempo.</p>
      <ul className="mt-3 flex flex-wrap gap-2" aria-label="Freunde, die ihren Fortschritt teilen">
        {shared.map((a) => (
          <li key={a.userId} className="flex items-center gap-2 rounded-full border border-[var(--line)] bg-white/60 py-1 pl-1 pr-3">
            <Avatar name={a.displayName} src={avatars[a.userId]} size="sm" />
            <span className="max-w-[10rem] truncate text-small font-semibold">{a.displayName}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
