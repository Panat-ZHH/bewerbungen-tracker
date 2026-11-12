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
    <section aria-labelledby="motivation-title" className="animate-rise flex items-start gap-4 sm:gap-6">
      {/* The shared number, loud. Decorative: the sentence next to it says the same. */}
      <span aria-hidden className="num-display shrink-0 text-[var(--brand)]">{total}</span>
      <div className="min-w-0 flex-1 pt-1">
        <h2 id="motivation-title" className="text-heading flex items-center gap-2"><span className="marker">Gemeinsam dranbleiben</span><Flame size={19} strokeWidth={2.3} className="shrink-0 text-[var(--coral)]" aria-hidden /></h2>
        <p className="mt-1.5 text-small text-muted">{me.displayName}, deine Freunde haben zusammen {total} Bewerbung{total === 1 ? "" : "en"} auf dem Weg. Jede zählt, jeder in seinem Tempo.</p>
        <ul className="mt-3 flex flex-wrap gap-2" aria-label="Freunde, die ihren Fortschritt teilen">
          {shared.map((a) => (
            <li key={a.userId} className="flex items-center gap-2 rounded-full border-[length:var(--border-w)] border-[var(--outline)] bg-[var(--surface)] py-0.5 pl-0.5 pr-3">
              <Avatar name={a.displayName} src={avatars[a.userId]} size="sm" />
              <span className="max-w-[10rem] truncate text-small font-semibold">{a.displayName}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
