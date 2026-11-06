"use client";

import { useState } from "react";
import Link from "next/link";
import { EyeOff, MapPin, Trash2, UserMinus } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { useAvatarUrls } from "@/components/ui/use-avatars";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { StatusMessage } from "@/components/ui/skeleton";
import { removeFriend } from "@/lib/social";
import type { ApplicationStatus, FriendActivity, SocialConnection } from "@/types";
import { friendlyError, statusLabels } from "./shared";

const order: ApplicationStatus[] = ["contract_signed", "offer", "final_interview", "aptitude_test", "interview", "schnupper_done", "schnupper_planned", "applied", "preparing", "saved", "rejected", "withdrawn"];
const tones: Partial<Record<ApplicationStatus, "success" | "info" | "brand" | "danger">> = { contract_signed: "success", offer: "success", schnupper_planned: "info", schnupper_done: "info", aptitude_test: "brand", final_interview: "brand", interview: "brand", applied: "info", rejected: "danger" };

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
      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {friends.map((friend) => {
          const act = activity.find((a) => a.userId === friend.otherUserId);
          const counts = act?.shared ? order.filter((s) => (act.statusCounts?.[s] ?? 0) > 0) : [];
          return (
            <li key={friend.id} className="min-w-0">
              <Card interactive className="h-full p-4">
                <div className="flex items-center gap-3">
                  <Avatar name={friend.displayName} src={avatars[friend.otherUserId]} size="lg" />
                  <div className="min-w-0 flex-1">
                    <Link href={`/friends/${encodeURIComponent(friend.otherUserId)}`} className="text-heading block truncate py-3 -my-3 hover:underline focus-visible:underline" title={`Insel von ${friend.displayName} ansehen`}>{friend.displayName}</Link>
                    {act?.shared ? <p className="text-small text-muted">{summary(act)}</p> : <Badge tone="neutral" className="mt-1 gap-1"><EyeOff size={12} aria-hidden />privat</Badge>}
                  </div>
                  <button type="button" aria-label={`${friend.displayName} entfernen`} title="Freundschaft beenden" onClick={() => { setError(""); setTarget(friend); }} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-[var(--danger-bg)] hover:text-[var(--danger-fg)]"><UserMinus size={17} /></button>
                </div>
                {act?.shared && (
                  <div className="mt-3 border-t border-[var(--line)] pt-3">
                    <div className="flex flex-wrap gap-1.5">
                      {counts.map((s) => <Badge key={s} tone={tones[s] ?? "neutral"}>{act.statusCounts?.[s]} {statusLabels[s]}</Badge>)}
                      {counts.length === 0 && <span className="text-small text-muted">Noch nichts zu zeigen.</span>}
                    </div>
                    <p className="mt-2 flex items-center gap-1.5 text-small text-muted"><MapPin size={13} aria-hidden /><span className="tabular">{act.mapPointsEarned ?? 0}</span> Map-Punkte, <span className="tabular">{act.mapItems ?? 0}</span> Map-Items</p>
                  </div>
                )}
              </Card>
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
