"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, EyeOff, Trash2, UserMinus } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { useAvatarUrls } from "@/components/ui/use-avatars";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { StatusMessage } from "@/components/ui/skeleton";
import { removeFriend } from "@/lib/social";
import type { ApplicationStatus, FriendActivity, SocialConnection } from "@/types";
import { friendlyError, statusLabels } from "./shared";

const order: ApplicationStatus[] = ["contract_signed", "offer", "final_interview", "aptitude_test", "interview", "schnupper_done", "schnupper_planned", "applied", "preparing", "saved", "rejected", "withdrawn"];
// Same flat status colours as the rest of the app: yellow = preparing, blue = sent, coral = interview, green = offer; Absage stays calm (neutral).
const tones: Partial<Record<ApplicationStatus, "success" | "info" | "coral" | "warning">> = { contract_signed: "success", offer: "success", schnupper_planned: "info", schnupper_done: "info", aptitude_test: "info", final_interview: "coral", interview: "coral", applied: "info", preparing: "warning" };

function summary(activity?: FriendActivity) {
  if (!activity || !activity.shared) return null;
  const total = activity.total ?? 0;
  if (total === 0) return "Noch keine Bewerbungen. Ein Anstupser kann helfen.";
  const counts = activity.statusCounts ?? {};
  const offers = (counts.offer ?? 0) + (counts.contract_signed ?? 0);
  if (offers > 0) return `${offers} Zusage${offers === 1 ? "" : "n"}. Glückwunsch!`;
  if ((counts.interview ?? 0) + (counts.final_interview ?? 0) > 0) return "Hat Gespräche im Kalender. Daumen drücken!";
  return `${total} Bewerbung${total === 1 ? "" : "en"} unterwegs.`;
}

export function FriendList({ friends, activity, onChanged }: { friends: SocialConnection[]; activity: FriendActivity[]; onChanged: () => void }) {
  const avatars = useAvatarUrls(friends.map((friend) => friend.otherUserId));
  const [target, setTarget] = useState<SocialConnection | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function confirm() {
    if (!target) return;
    setBusy(true); setError("");
    try { await removeFriend(target.id); setTarget(null); onChanged(); } catch (reason) { setError(friendlyError(reason)); } finally { setBusy(false); }
  }

  return (
    <>
      <ul className="rows mt-2 border-y-[length:var(--border-w)] border-[var(--outline)]">
        {friends.map((friend) => {
          const act = activity.find((a) => a.userId === friend.otherUserId);
          const counts = act?.shared ? order.filter((s) => (act.statusCounts?.[s] ?? 0) > 0) : [];
          return (
            <li key={friend.id} className="flex min-w-0 items-start gap-3 py-4 sm:gap-4">
              <Avatar name={friend.displayName} src={avatars[friend.otherUserId]} size="lg" />
              <div className="min-w-0 flex-1">
                <Link href={`/friends/${encodeURIComponent(friend.otherUserId)}`} className="group -my-3 flex min-w-0 items-center gap-1.5 py-3" title={`Insel von ${friend.displayName} ansehen`}>
                  <span className="font-display truncate text-lg font-bold leading-tight tracking-[-.02em] group-hover:underline group-hover:decoration-[var(--sun)] group-hover:decoration-4 group-hover:underline-offset-4 group-focus-visible:underline">{friend.displayName}</span>
                  <ArrowRight size={16} strokeWidth={2.4} aria-hidden className="shrink-0 text-muted transition-transform duration-200 group-hover:translate-x-1" />
                </Link>
                {act?.shared ? <p className="text-small text-muted">{summary(act)}</p> : <Badge tone="neutral" className="mt-1 gap-1"><EyeOff size={12} aria-hidden />privat</Badge>}
                {act?.shared && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {counts.map((s) => <Badge key={s} tone={tones[s] ?? "neutral"}>{act.statusCounts?.[s]} {statusLabels[s]}</Badge>)}
                    {counts.length === 0 && <span className="text-small text-muted">Noch nichts zu zeigen.</span>}
                  </div>
                )}
              </div>
              <button type="button" aria-label={`${friend.displayName} entfernen`} title="Freundschaft beenden" onClick={() => { setError(""); setTarget(friend); }} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-[var(--hover)] hover:text-[var(--danger-fg)] active:translate-y-px"><UserMinus size={17} /></button>
            </li>
          );
        })}
      </ul>
      <Modal
        open={!!target}
        onClose={() => { if (!busy) setTarget(null); }}
        title="Freundschaft beenden?"
        description={target ? `${target.displayName} sieht deine Aktivität danach nicht mehr und du ihre auch nicht.` : undefined}
        footer={<div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button variant="secondary" className="min-h-11 sm:min-h-11" onClick={() => setTarget(null)} disabled={busy}>Abbrechen</Button><Button variant="danger" loading={busy} onClick={confirm} icon={<Trash2 size={15} />}>Entfernen</Button></div>}
      >
        {error && <StatusMessage tone="danger">{error}</StatusMessage>}
      </Modal>
    </>
  );
}
