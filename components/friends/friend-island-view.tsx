"use client";

import { useEffect, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { useAvatarUrls } from "@/components/ui/use-avatars";
import { ReadOnlyVillageView } from "@/components/applications/read-only-village-view";
import { friendIslandError, getFriendIsland, type FriendIsland } from "@/lib/friend-island";
import layout from "@/app/map/fullscreen.module.css";
import { overlayClasses } from "@/components/applications/map-fullscreen";

/**
 * Read-only view of an accepted friend's island. It only ever calls the read-only RPC map_friend_island:
 * no shop hook, no save/move/place/delete functions, no edit toolbar. Camera (pan/zoom/day-night) is the only interaction.
 * The screen itself is the shared ReadOnlyVillageView (the parent view of a child's village uses the same one).
 */
export function FriendIslandView({ friendId }: { friendId: string }) {
  const [island, setIsland] = useState<FriendIsland | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const avatars = useAvatarUrls([friendId]);

  useEffect(() => {
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset before the (re)fetch
    setLoading(true); setError("");
    getFriendIsland(friendId)
      .then((value) => { if (active) setIsland(value); })
      .catch((reason) => { if (active) { setIsland(null); setError(friendIslandError(reason)); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [friendId, attempt]);

  const name = island?.displayName || "Freund";
  return (
    <ReadOnlyVillageView
      village={island ? { applications: island.applications, items: island.items, layouts: island.layouts, islandCount: island.islands } : null}
      loading={loading}
      heading={island ? `Insel von ${name} (nur ansehen)` : "Insel eines Freundes"}
      label={`Insel von ${name}`}
      waitingText={error ? null : "Insel wird geladen ..."}
      back={{ href: "/friends", ariaLabel: "Zurück zu Freunden", text: "Freunde" }}
      chip={{
        id: "friend",
        icon: <Avatar name={island?.displayName} src={avatars[friendId]} size="sm" />,
        name,
        panelLabel: `Info zur Insel von ${name}`,
        note: <>{island?.companiesShared ? `Du siehst nur das Dorf und die Firmennamen, bei denen sich ${name} beworben hat.` : `Du siehst nur das Dorf, ohne Firmennamen.`} Stellen, Daten und Notizen bleiben privat.</>,
      }}
      dock={error && <div className={`${layout.notice} ${layout.noticeDanger} ${overlayClasses.sticker}`} role="alert"><p>{error}</p><button type="button" onClick={() => setAttempt(attempt + 1)}>Erneut versuchen</button></div>}
    />
  );
}
