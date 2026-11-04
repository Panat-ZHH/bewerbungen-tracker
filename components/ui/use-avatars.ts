"use client";

import { useEffect, useState } from "react";
import { getAvatarUrls, getMyAvatarUrl, onAvatarChanged } from "@/lib/avatar-storage";

/** The signed-in user's own avatar URL (null = none). Updates live when it is changed on the profile page. */
export function useMyAvatar(enabled = true) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    getMyAvatarUrl().then((value) => { if (active) setUrl(value); }).catch(() => undefined);
    const off = onAvatarChanged((value) => { if (active) setUrl(value); });
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
