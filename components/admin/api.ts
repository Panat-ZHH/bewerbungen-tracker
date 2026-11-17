// The one client helper for /api/admin/*. The access token comes from the current Supabase session and goes ONLY into the
// Authorization header (never into a URL, never into storage). Responses stay in React state of the caller.
import { supabase } from "@/lib/supabase";

export type AdminResult<T = unknown> = { ok: boolean; status: number; data: T };
export type AdminErrorBody = { error?: string; reason?: string; field?: string; message?: string; retryAfter?: number };

/** "mfa" = 403 mfa_required, "reauth" = 403 reauth_required (last login too old), "login" = 401 (session gone).
 *  Registered by the admin page to switch to the right step. */
export type AdminAuthKind = "mfa" | "reauth" | "login";
type AuthHandler = (kind: AdminAuthKind) => void;
let authHandler: AuthHandler | null = null;
export function setAdminAuthHandler(fn: AuthHandler | null) { authHandler = fn; }

export async function accessToken(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

export async function adminFetch<T = unknown>(path: string, opts: { method?: "GET" | "POST"; body?: Record<string, unknown> } = {}): Promise<AdminResult<T>> {
  const token = await accessToken();
  if (!token) {
    authHandler?.("login");
    return { ok: false, status: 401, data: { error: "unauthenticated" } as T };
  }
  const headers: Record<string, string> = { Authorization: `Bearer ${token}`, Accept: "application/json" };
  if (opts.body) headers["Content-Type"] = "application/json";
  let res: Response;
  try {
    res = await fetch(path, {
      method: opts.method ?? (opts.body ? "POST" : "GET"),
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      cache: "no-store",
      credentials: "omit",
    });
  } catch {
    return { ok: false, status: 0, data: { error: "network" } as T };
  }
  let data: unknown = null;
  try { data = await res.json(); } catch { data = null; }
  const err = (data ?? {}) as AdminErrorBody;
  if (res.status === 403 && err.error === "mfa_required") authHandler?.("mfa");
  else if (res.status === 403 && err.error === "reauth_required") authHandler?.("reauth");
  else if (res.status === 401) authHandler?.("login");
  return { ok: res.ok, status: res.status, data: data as T };
}

/** Builds a query string, dropping empty values. */
export function qs(params: Record<string, string | number | null | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== null && v !== undefined && v !== "" && v !== "all") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
}

const CONFLICTS: Record<string, string> = {
  not_blocked: "Das Konto muss zuerst gesperrt sein.",
  self: "Das geht nicht mit deinem eigenen Konto.",
  platform_admin: "Admin-Konten kannst du hier nicht sperren, löschen oder ihnen den Gratis-Zugang entziehen.",
  not_granted: "Hier gibt es keinen Gratis-Zugang zum Entziehen.",
  user_not_found: "Kein Konto mit dieser E-Mail.",
  already_member: "Diese Person ist schon dabei.",
  licence_closed: "Diese Lizenz ist schon beendet.",
  already_cancelled: "Diese Lizenz ist schon widerrufen.",
};

/** Short German message for a failed admin call. `labels` maps field names to readable labels. */
export function errorText(res: AdminResult, labels: Record<string, string> = {}): string {
  const e = (res.data ?? {}) as AdminErrorBody;
  if (res.status === 0) return "Keine Verbindung. Prüf dein Internet und versuch es nochmals.";
  if (res.status === 429) return e.message || "Zu viele Anfragen. Bitte warte kurz.";
  if (res.status === 401) return "Deine Sitzung ist abgelaufen. Bitte melde dich neu an.";
  if (res.status === 403) return "Bitte bestätige zuerst deinen Code.";
  if (res.status === 404) return "Nicht gefunden. Vielleicht wurde es gerade gelöscht.";
  if (res.status === 400 && e.error === "invalid_input") {
    if (e.field === "confirm") return "Bitte bestätige die Aktion.";
    return e.field ? `Bitte prüf das Feld «${labels[e.field] ?? e.field}».` : "Bitte prüf deine Eingaben.";
  }
  if (res.status === 409 && e.error === "subscription_active") return "Läuft noch ein Abo – zuerst in Stripe kündigen.";
  if (res.status === 409 && e.reason) return CONFLICTS[e.reason] ?? "Das geht gerade nicht.";
  if (res.status === 503) return "Der Server ist noch nicht eingerichtet.";
  return "Das hat nicht geklappt. Versuch es nochmals.";
}

export const fieldOf = (res: AdminResult): string | null => {
  const e = (res.data ?? {}) as AdminErrorBody;
  return res.status === 400 && e.error === "invalid_input" && e.field ? e.field : null;
};
