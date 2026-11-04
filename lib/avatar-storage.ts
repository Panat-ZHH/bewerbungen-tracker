import { supabase } from "@/lib/supabase";
import { avatarPath, pathFromAvatarUrl, withVersion } from "@/lib/avatar";

const BUCKET = "avatars";
const CHANGED = "wendapply:avatar-changed";
const LOCAL_KEY = "wendapply-avatar-local";

/** NEXT_PUBLIC_AVATAR_LOCAL=1 keeps the picture in this browser only (no Supabase Storage), for tests with dummy env vars. */
export const avatarLocalMode = process.env.NEXT_PUBLIC_AVATAR_LOCAL === "1";

async function currentUserId() { const { data, error } = await supabase.auth.getUser(); if (error || !data.user) throw new Error("You must be signed in."); return data.user.id; }
function announce(url: string | null) { if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(CHANGED, { detail: url })); }
export function onAvatarChanged(listener: (url: string | null) => void) {
  const handler = (event: Event) => listener((event as CustomEvent<string | null>).detail);
  window.addEventListener(CHANGED, handler);
  return () => window.removeEventListener(CHANGED, handler);
}
function blobToDataUrl(blob: Blob) { return new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob); }); }

export async function getMyAvatarUrl(): Promise<string | null> {
  if (avatarLocalMode) return localStorage.getItem(LOCAL_KEY);
  const userId = await currentUserId();
  const { data, error } = await supabase.from("profiles").select("avatar_url").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return (data?.avatar_url as string | null | undefined) ?? null;
}

async function saveAvatarUrl(userId: string, url: string | null) {
  const { data, error } = await supabase.from("profiles").update({ avatar_url: url }).eq("user_id", userId).select("id");
  if (error) throw error;
  if (data?.length) return;
  if (url === null) return;
  const { error: insertError } = await supabase.from("profiles").insert({ id: `profile-${userId}`, user_id: userId, first_name: "", last_name: "", email: "", avatar_url: url });
  if (insertError) throw insertError;
}

/** Uploads an already cropped and compressed image and stores its versioned public URL in profiles.avatar_url. */
export async function uploadAvatar(blob: Blob): Promise<string> {
  if (avatarLocalMode) { const url = await blobToDataUrl(blob); localStorage.setItem(LOCAL_KEY, url); announce(url); return url; }
  const userId = await currentUserId();
  const previous = await getMyAvatarUrl().catch(() => null);
  const path = avatarPath(userId, blob.type);
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { upsert: true, contentType: blob.type, cacheControl: "3600" });
  if (error) throw error;
  const url = withVersion(supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl, Date.now());
  await saveAvatarUrl(userId, url);
  // A different extension than before would leave an orphan file behind.
  const oldPath = previous ? pathFromAvatarUrl(previous) : undefined;
  if (oldPath && oldPath !== path) await supabase.storage.from(BUCKET).remove([oldPath]);
  announce(url);
  return url;
}

export async function removeAvatar(): Promise<void> {
  if (avatarLocalMode) { localStorage.removeItem(LOCAL_KEY); announce(null); return; }
  const userId = await currentUserId();
  const previous = await getMyAvatarUrl();
  await saveAvatarUrl(userId, null);
  const path = previous ? pathFromAvatarUrl(previous) : undefined;
  if (path && path.startsWith(`${userId}/`)) await supabase.storage.from(BUCKET).remove([path]);
  announce(null);
}

/** Avatar URLs of other users (friends, class members). The server only returns users the caller may see. */
export async function getAvatarUrls(userIds: string[]): Promise<Record<string, string>> {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length || avatarLocalMode) return {};
  const { data, error } = await supabase.rpc("social_avatars", { p_user_ids: ids });
  if (error) return {};
  return Object.fromEntries(((data ?? []) as { user_id: string; avatar_url: string | null }[]).filter((row) => row.avatar_url).map((row) => [row.user_id, row.avatar_url as string]));
}
