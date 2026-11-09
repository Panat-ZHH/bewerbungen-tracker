"use client";
// Browser-side data access for reminders (RLS limits everything to the signed-in user).
import { supabase } from "@/lib/supabase";
import { DEFAULT_SETTINGS, isoDay, newFeedToken, normalizeSettings, type ReminderSettings } from "@/lib/reminders";

async function uid() { const { data, error } = await supabase.auth.getUser(); if (error || !data.user) throw new Error("You must be signed in."); return data.user.id; }

export async function loadReminderSettings(): Promise<ReminderSettings> {
  const { data, error } = await supabase.from("reminder_settings").select("*").eq("user_id", await uid()).maybeSingle();
  if (error) throw error;
  return data ? normalizeSettings(data) : DEFAULT_SETTINGS;
}
export async function saveReminderSettings(s: ReminderSettings) {
  const { error } = await supabase.from("reminder_settings").upsert({ user_id: await uid(), in_app: s.inApp, email: s.email, push: s.push, days_before: s.daysBefore, stale_days: s.staleDays, updated_at: new Date().toISOString() });
  if (error) throw error;
}

export type Feed = { id: string; token: string; applicationId: string | null };
export const feedUrl = (token: string) => `${window.location.origin}/api/ics/feed/${token}`;
export async function listFeeds(): Promise<Feed[]> {
  const { data, error } = await supabase.from("calendar_feeds").select("id,token,application_id").eq("user_id", await uid());
  if (error) throw error;
  return (data ?? []).map((f) => ({ id: f.id, token: f.token, applicationId: f.application_id }));
}
export async function createFeed(applicationId: string | null): Promise<Feed> {
  const token = newFeedToken();
  const { data, error } = await supabase.from("calendar_feeds").insert({ user_id: await uid(), application_id: applicationId, token }).select("id,token,application_id").single();
  if (error) throw error;
  return { id: data.id, token: data.token, applicationId: data.application_id };
}
export async function revokeFeed(id: string) {
  const { error } = await supabase.from("calendar_feeds").delete().eq("id", id).eq("user_id", await uid());
  if (error) throw error;
}

export const todayLocal = () => isoDay(new Date());

// ---- Web Push ----
export const pushSupported = () => typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
const toKey = (b64: string) => { const p = "=".repeat((4 - (b64.length % 4)) % 4); const raw = atob((b64 + p).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from(raw, (c) => c.charCodeAt(0)); };
async function bearer() { const { data } = await supabase.auth.getSession(); if (!data.session) throw new Error("You must be signed in."); return { Authorization: `Bearer ${data.session.access_token}`, "Content-Type": "application/json" }; }

/** Returns "ok" | "denied" | "unsupported" | "not_configured". */
export async function enablePush(): Promise<"ok" | "denied" | "unsupported" | "not_configured"> {
  if (!pushSupported()) return "unsupported";
  const key = await fetch("/api/reminders/push").then((r) => (r.ok ? r.json() : null)).catch(() => null) as { publicKey?: string } | null;
  if (!key?.publicKey) return "not_configured";
  if ((await Notification.requestPermission()) !== "granted") return "denied";
  const reg = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(key.publicKey) });
  const res = await fetch("/api/reminders/push", { method: "POST", headers: await bearer(), body: JSON.stringify(sub.toJSON()) });
  if (!res.ok) throw new Error("PUSH_SAVE_FAILED");
  return "ok";
}
export async function disablePush() {
  if (!pushSupported()) return;
  const reg = await navigator.serviceWorker.getRegistration("/sw.js");
  const sub = await reg?.pushManager.getSubscription();
  if (sub) { await fetch("/api/reminders/push", { method: "DELETE", headers: await bearer(), body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => undefined); await sub.unsubscribe().catch(() => undefined); }
}
