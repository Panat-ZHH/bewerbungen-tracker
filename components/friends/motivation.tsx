"use client";

import { Flame, Trophy } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { useAvatarUrls } from "@/components/ui/use-avatars";
import type { FriendActivity, SocialProfile } from "@/types";

/** Friendly, low-pressure strip showing the most active friends (by map points). */
export function Motivation({ activity, me }: { activity: FriendActivity[]; me: SocialProfile }) {
  const shared = activity.filter((a) => a.shared);
  const avatars = useAvatarUrls(shared.map((a) => a.userId));
  if (shared.length === 0) return null;
  const ranked = [...shared].sort((a, b) => (b.mapPointsEarned ?? 0) - (a.mapPointsEarned ?? 0) || (b.total ?? 0) - (a.total ?? 0)).slice(0, 3);
  const total = shared.reduce((sum, a) => sum + (a.total ?? 0), 0);
  return (
    <section aria-labelledby="motivation-title" className="animate-rise panel p-4 sm:p-5">
      <div className="flex items-center gap-2"><Flame size={18} className="text-[var(--warning-fg)]" aria-hidden /><h2 id="motivation-title" className="text-heading">Gemeinsam dranbleiben</h2></div>
      <p className="mt-1 text-small text-muted">{me.displayName}, deine Freunde haben zusammen {total} Bewerbung{total === 1 ? "" : "en"} auf dem Weg. Jede zählt.</p>
      <ol className="mt-3 flex gap-2 overflow-x-auto pb-1">
        {ranked.map((a, i) => (
          <li key={a.userId} className="flex min-w-[9.5rem] flex-1 items-center gap-2.5 rounded-[var(--radius-md)] border border-[var(--line)] bg-white/60 p-2.5">
            <Avatar name={a.displayName} src={avatars[a.userId]} size="sm" />
            <div className="min-w-0">
              <p className="truncate text-small font-semibold">{a.displayName}</p>
              <p className="flex items-center gap-1 text-[11px] text-muted"><Trophy size={11} aria-hidden />Platz {i + 1}, <span className="tabular">{a.mapPointsEarned ?? 0}</span> Punkte</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
