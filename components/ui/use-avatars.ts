"use client";

import { useEffect, useState } from "react";
import { getAvatarUrls, getMyAvatarUrl, onAvatarChanged } from "@/lib/avatar-storage";

/** The signed-in user's own avatar URL (null = none). Updates live when it is changed on the profile page. */
// Own avatar URL for this tab (perf: the shell asked profiles.avatar_url again on every page). Updated on change, reset on sign-out.
let myAvatarCache: { url: string | null } | null = null;
export function clearMyAvatarCache() { myAvatarCache = null; }
export function useMyAvatar(enabled = true) {
  const [url, setUrl] = useState<string | null>(() => myAvatarCache?.url ?? null);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    if (!myAvatarCache) getMyAvatarUrl().then((value) => { myAvatarCache = { url: value }; if (active) setUrl(value); }).catch(() => undefined);
    const off = onAvatarChanged((value) => { myAvatarCache = { url: value }; if (active) setUrl(value); });
    return () => { active = false; off(); };
  }, [enabled]);
  return url;
}

/** Avatar URLs for other users by id (friends, class members); missing ids simply show initials. */
export function useAvatarUrls(userIds: string[]) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const key = [...new Set(userIds.filter(Boolean))].sort().join(",");
  useEffect(() => {
    if (!key) return;
    let active = true;
    getAvatarUrls(key.split(",")).then((value) => { if (active) setUrls(value); });
    return () => { active = false; };
  }, [key]);
  return urls;
}
