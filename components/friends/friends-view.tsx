"use client";

import { useCallback, useEffect, useState } from "react";
import { Eye, EyeOff, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton, StatusMessage } from "@/components/ui/skeleton";
import { getFriendsActivity, getMySocialProfile, listConnections, updateMySocialProfile } from "@/lib/social";
import type { FriendActivity, SocialConnection, SocialProfile } from "@/types";
import { PrivacyPanel } from "@/components/classes/privacy-panel";
import { AddFriend } from "./add-friend";
import { FriendList } from "./friend-list";
import { InviteCard } from "./invite-card";
import { Motivation } from "./motivation";
import { PendingInvite } from "./pending-invite";
import { Requests } from "./requests";
import { friendlyError } from "./shared";

export function FriendsView() {
  const [profile, setProfile] = useState<SocialProfile | null>(null);
  const [connections, setConnections] = useState<SocialConnection[]>([]);
  const [activity, setActivity] = useState<FriendActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sharingBusy, setSharingBusy] = useState(false);
  const [sharingError, setSharingError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const [me, list, acts] = await Promise.all([getMySocialProfile(), listConnections(), getFriendsActivity().catch(() => [] as FriendActivity[])]);
      setProfile(me);
      setConnections(list);
      setActivity(acts);
    } catch (reason) {
      setError(friendlyError(reason, "Deine Freunde konnten nicht geladen werden."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial data fetch
    void load();
  }, [load]);

  async function toggleSharing() {
    if (!profile) return;
    setSharingBusy(true); setSharingError("");
    try { setProfile(await updateMySocialProfile({ shareWithFriends: !profile.shareWithFriends })); } catch (reason) { setSharingError(friendlyError(reason)); } finally { setSharingBusy(false); }
  }

  const friends = connections.filter((c) => c.state === "friend");
  const incoming = connections.filter((c) => c.state === "incoming");
  const outgoing = connections.filter((c) => c.state === "outgoing");

  return (
    <div className="pb-safe">
      <PageHeader eyebrow="Freunde" title="Gemeinsam bewerben" description="Teile deinen Code, motiviert euch gegenseitig und feiert jede Zusage zusammen." />
      {loading ? (
        <div className="space-y-4" aria-busy="true" aria-label="Freunde werden geladen"><Skeleton className="h-44" /><Skeleton className="h-40" /><Skeleton className="h-32" /></div>
      ) : error || !profile ? (
        <StatusMessage tone="danger"><p>{error || "Deine Freunde konnten nicht geladen werden."}</p><Button className="mt-2 min-h-11 sm:min-h-11" size="sm" variant="secondary" onClick={() => { setLoading(true); void load(); }}>Erneut versuchen</Button></StatusMessage>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
          <div className="min-w-0 space-y-5">
            <InviteCard profile={profile} />
            <AddFriend onChanged={load} />
            <Card className="animate-rise p-4">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--brand-soft)] text-[var(--brand)]">{profile.shareWithFriends ? <Eye size={18} /> : <EyeOff size={18} />}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">Aktivität mit Freunden teilen</p>
                  <p className="text-small text-muted">{profile.shareWithFriends ? "Freunde sehen Anzahl und Status, nie Firmen, Notizen oder Gehalt." : "Du bist für Freunde auf privat gestellt."}</p>
                </div>
                <button type="button" role="switch" aria-checked={profile.shareWithFriends} aria-label="Aktivität mit Freunden teilen" disabled={sharingBusy} onClick={toggleSharing} className="group flex min-h-11 min-w-12 shrink-0 items-center justify-center disabled:opacity-60">
                  <span aria-hidden className={`relative block h-7 w-12 rounded-full transition-colors ${profile.shareWithFriends ? "bg-[var(--brand)]" : "bg-[var(--line)]"}`}><span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${profile.shareWithFriends ? "left-[1.35rem]" : "left-0.5"}`} /></span>
                </button>
              </div>
              {sharingError && <StatusMessage tone="danger" className="mt-3">{sharingError}</StatusMessage>}
            </Card>
            <PrivacyPanel variant="friends" />
          </div>
          <div className="min-w-0 space-y-5">
            <PendingInvite onChanged={load} />
            <Requests incoming={incoming} outgoing={outgoing} onChanged={load} />
            <Motivation activity={activity} me={profile} />
            <section aria-labelledby="friends-title" className="space-y-3">
              <h2 id="friends-title" className="text-heading">Deine Freunde {friends.length > 0 && <span className="tabular text-muted">({friends.length})</span>}</h2>
              {friends.length === 0 ? (
                <EmptyState icon={<Users />} title="Noch keine Freunde hier" description="Schick deinen Einladungslink an jemanden, der sich auch bewirbt. Zu zweit fällt es leichter." />
              ) : (
                <FriendList friends={friends} activity={activity} onChanged={load} />
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
