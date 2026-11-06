import { createClient } from "@supabase/supabase-js";
import { confirmationMatches, isFreshSignIn } from "@/lib/account-deletion";
import { deleteAccount } from "@/lib/account-delete-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const headers = { "Cache-Control": "no-store" };
const reply = (status: number, code: string, message: string) => Response.json({ ok: false, code, message }, { status, headers });

/**
 * POST /api/account/delete   Authorization: Bearer <access token>   body: { confirm: "LÖSCHEN" | <e-mail> }
 * 1. the token must belong to a real session (verified by Supabase Auth),
 * 2. the sign-in must be fresh (< 5 min): the client re-authenticates with the password or Google right before,
 * 3. the typed confirmation must match,
 * 4. then files, rows (cascade) and the auth user are deleted with the service role key (server-side env only).
 */
export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return reply(503, "NOT_CONFIGURED", "Das Löschen ist auf diesem Server noch nicht eingerichtet. Bitte melde dich beim Support.");

  const token = /^Bearer (.+)$/i.exec(request.headers.get("authorization") ?? "")?.[1];
  if (!token) return reply(401, "UNAUTHENTICATED", "Bitte melde dich an.");

  let body: { confirm?: unknown };
  try { body = await request.json(); } catch { return reply(400, "INVALID_REQUEST", "Ungültige Anfrage."); }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return reply(401, "UNAUTHENTICATED", "Deine Anmeldung ist abgelaufen. Bitte melde dich neu an.");
  const user = data.user;

  if (!isFreshSignIn(token)) return reply(403, "REAUTH_REQUIRED", "Bitte bestätige zuerst mit deinem Passwort oder mit Google, dass du es bist.");
  if (typeof body.confirm !== "string" || !confirmationMatches(body.confirm, user.email)) return reply(400, "CONFIRMATION_MISMATCH", "Die Bestätigung stimmt nicht. Tippe LÖSCHEN oder deine E-Mail-Adresse.");

  try {
    const result = await deleteAccount(admin, user.id);
    if (Object.keys(result.remaining).length) console.error("account deletion: leftovers", user.id, Object.keys(result.remaining));
    return Response.json({ ok: true, files: result.files, classesTransferred: result.classesTransferred, classesDeleted: result.classesDeleted }, { headers });
  } catch (reason) {
    console.error("account deletion failed", user.id, reason instanceof Error ? reason.message.split(":")[0] : "unknown");
    return reply(500, "DELETE_FAILED", "Das Konto konnte nicht vollständig gelöscht werden. Bitte versuche es nochmal.");
  }
}
