// SERVER ONLY. Digest run: finds due reminders per user and sends e-mail / push, once per reminder (reminder_log).
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { computeReminders, digestText, isoDay, normalizeSettings } from "@/lib/reminders";
import { getMailer, type Mailer } from "@/lib/reminders-mail";
import { sendPush, vapidFromEnv, type VapidKeys } from "@/lib/reminders-push";

export function adminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
}

export const appBaseUrl = () => (process.env.APP_URL || process.env.URL || "https://wendapply.ch").replace(/\/$/, "");
/** Today in the Swiss calendar, whatever the server time zone is. */
export const swissToday = (now = new Date()) => isoDay(new Date(now.toLocaleString("en-US", { timeZone: "Europe/Zurich" })));

export type DigestSummary = { users: number; emails: number; pushes: number; skippedNoMailer: number; dryRun: boolean };

export async function runDigest(admin: SupabaseClient, opts: { dryRun?: boolean; mailer?: Mailer; vapid?: VapidKeys | null; today?: string } = {}): Promise<DigestSummary> {
  const mailer = opts.mailer ?? getMailer(), vapid = opts.vapid === undefined ? vapidFromEnv() : opts.vapid, today = opts.today ?? swissToday();
  const sum: DigestSummary = { users: 0, emails: 0, pushes: 0, skippedNoMailer: 0, dryRun: Boolean(opts.dryRun) };
  const { data: rows, error } = await admin.from("reminder_settings").select("*").or("email.eq.true,push.eq.true");
  if (error) throw new Error(`SETTINGS_FAILED:${error.code ?? ""}`);
  for (const row of rows ?? []) {
    const settings = normalizeSettings(row);
    const { data: apps } = await admin.from("applications").select("id,company,position,status,deadline,updated_at,applied_at").eq("user_id", row.user_id);
    const mapped = (apps ?? []).map((a) => ({ id: a.id, company: a.company, position: a.position, status: a.status, deadline: a.deadline ?? undefined, updatedAt: a.updated_at, appliedAt: a.applied_at ?? undefined }));
    // only fresh items: a deadline today/within window, never old missed ones (those are in-app only)
    const all = computeReminders(mapped as never, settings, today).filter((r) => r.kind === "stale" ? r.days === settings.staleDays : r.days >= 0);
    for (const channel of ["email", "push"] as const) {
      if (!settings[channel]) continue;
      const { data: logged } = await admin.from("reminder_log").select("application_id,kind,due_on").eq("user_id", row.user_id).eq("channel", channel);
      const seen = new Set((logged ?? []).map((l) => `${l.application_id}:${l.kind}:${String(l.due_on).slice(0, 10)}`));
      const fresh = all.filter((r) => !seen.has(r.key));
      if (!fresh.length) continue;
      let delivered = false;
      if (opts.dryRun) { console.log(`[reminders] dry-run: ${channel} for ${fresh.length} reminders`); continue; }
      if (channel === "email") {
        if (!mailer.configured) { sum.skippedNoMailer++; continue; }
        const { data: u } = await admin.auth.admin.getUserById(row.user_id);
        if (!u?.user?.email) continue;
        const { subject, text } = digestText(fresh, appBaseUrl());
        await mailer.send({ to: u.user.email, subject, text }); sum.emails++; delivered = true;
      } else if (vapid) {
        const { data: subs } = await admin.from("push_subscriptions").select("id,endpoint,p256dh,auth").eq("user_id", row.user_id);
        for (const s of subs ?? []) {
          const r = await sendPush(s, { title: fresh.length === 1 ? fresh[0].title : `${fresh.length} Erinnerungen`, body: fresh.length === 1 ? fresh[0].detail : fresh.map((f) => f.company).join(", "), url: "/dashboard" }, vapid).catch(() => ({ ok: false, gone: false, status: 0 }));
          if (r.gone) await admin.from("push_subscriptions").delete().eq("id", s.id);
          if (r.ok) { delivered = true; sum.pushes++; }
        }
      }
      if (delivered) await admin.from("reminder_log").upsert(fresh.map((r) => ({ user_id: row.user_id, application_id: r.applicationId, kind: r.kind, due_on: r.dueOn, channel })));
    }
    sum.users++;
  }
  return sum;
}
