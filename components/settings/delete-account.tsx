"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { StatusMessage } from "@/components/ui/skeleton";
import { supabase } from "@/lib/supabase";
import { DELETE_CONFIRM_WORD, REAUTH_FLAG, confirmationMatches, deletionItems, isFreshSignIn, teacherWarning, withSupport, type AccountSummary } from "@/lib/account-deletion";

type Identity = { email: string | null; hasPassword: boolean };

/** Wipes everything this browser kept for the app (the theme choice stays, it is not personal data). */
function clearBrowserData() {
  try {
    for (const key of Object.keys(localStorage)) if (!/theme/i.test(key)) localStorage.removeItem(key);
    sessionStorage.clear();
  } catch { /* storage unavailable */ }
}

export function DeleteAccountCard() {
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState<AccountSummary | null>(null);
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [fresh, setFresh] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const openedByReturn = useRef(false);
  useEffect(() => { if (error) document.getElementById("delete-error")?.scrollIntoView({ block: "center", behavior: "smooth" }); }, [error]);

  async function load() {
    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;
    setIdentity({ email: user?.email ?? null, hasPassword: Boolean(user?.identities?.some((i) => i.provider === "email")) });
    const { data: sessionData } = await supabase.auth.getSession();
    setFresh(Boolean(sessionData.session && isFreshSignIn(sessionData.session.access_token)));
    const { data } = await supabase.rpc("account_delete_summary");
    setSummary((data as AccountSummary | null) ?? null);
  }

  function show() {
    setError(""); setConfirm(""); setPassword("");
    setOpen(true);
    void load();
  }

  useEffect(() => {
    // Back from the Google re-sign-in (/auth/callback?next=/settings?delete=1): reopen the dialog.
    if (openedByReturn.current) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("delete") === "1" && sessionStorage.getItem(REAUTH_FLAG)) {
      openedByReturn.current = true;
      sessionStorage.removeItem(REAUTH_FLAG);
      window.history.replaceState(null, "", "/settings");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- the URL is only readable on the client, after hydration
      show();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function reauthWithGoogle() {
    setBusy(true); setError("");
    sessionStorage.setItem(REAUTH_FLAG, "1");
    const { error: oauthError } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent("/settings?delete=1")}` } });
    if (oauthError) { sessionStorage.removeItem(REAUTH_FLAG); setError(withSupport("Google konnte nicht geöffnet werden.")); setBusy(false); }
  }

  async function deleteNow() {
    setBusy(true); setError("");
    try {
      if (identity?.hasPassword) {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email: identity.email ?? "", password });
        if (signInError) { setError(/invalid|credentials/i.test(signInError.message) ? "Das Passwort stimmt nicht." : withSupport("Die Anmeldung hat nicht geklappt.")); setBusy(false); return; }
      }
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) { setError("Deine Anmeldung ist abgelaufen. Bitte melde dich neu an."); setBusy(false); return; }
      const response = await fetch("/api/account/delete", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ confirm }) });
      const result = (await response.json().catch(() => ({}))) as { ok?: boolean; code?: string; message?: string };
      if (!response.ok || !result.ok) {
        if (result.code === "REAUTH_REQUIRED") setFresh(false);
        setError(result.code === "REAUTH_REQUIRED" || result.code === "CONFIRMATION_MISMATCH" ? (result.message ?? "") : withSupport(result.message ?? "Das Konto konnte nicht gelöscht werden."));
        setBusy(false);
        return;
      }
      await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
      clearBrowserData();
      window.location.replace("/login?deleted=1");
    } catch {
      setError(withSupport("Keine Verbindung. Bitte prüfe dein Internet und versuche es nochmal."));
      setBusy(false);
    }
  }

  const items = deletionItems(summary);
  const warning = teacherWarning(summary);
  const confirmed = confirmationMatches(confirm, identity?.email);
  const authReady = identity?.hasPassword ? password.length > 0 : fresh;
  const canDelete = confirmed && authReady && identity !== null && !busy;

  return (
    <>
      {/* The only danger area of the settings: flat, calm, one contour in the danger tone. */}
      <div className="rounded-[var(--radius-xl)] border-[length:var(--border-w)] border-[var(--danger-fg)] bg-[var(--surface)] p-4 sm:p-5">
        <h3 className="font-display text-lg font-bold leading-tight tracking-[-.02em] text-[var(--danger-fg)]">Konto löschen</h3>
        <p className="mt-1.5 text-body text-muted">Löscht dein Konto samt Anmeldung, allen Daten und Dateien dauerhaft. Das kann nicht rückgängig gemacht werden.</p>
        <Button variant="danger" onClick={show} full className="mt-4 sm:min-h-11 sm:w-auto" icon={<AlertTriangle size={16} />}>Konto löschen…</Button>
        <p className="mt-3 text-small text-muted">Tipp: Lade vorher oben eine Sicherung deiner Daten herunter.</p>
      </div>

      <Modal open={open} onClose={() => !busy && setOpen(false)} title="Konto endgültig löschen?" description="Dein Konto und alle Daten werden sofort und dauerhaft gelöscht."
        footer={<><Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>Abbrechen</Button><Button variant="danger" onClick={deleteNow} loading={busy} disabled={!canDelete}>Konto endgültig löschen</Button></>}>
        <div className="space-y-4">
          <div>
            <p className="text-sm font-semibold">Das wird gelöscht:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted" data-testid="delete-items">{items.map((item) => <li key={item}>{item}</li>)}</ul>
          </div>
          {warning && <StatusMessage tone="danger" icon={<AlertTriangle />}>{warning}</StatusMessage>}
          <p className="text-sm text-muted">Danach bist du abgemeldet. Wir können nichts davon wiederherstellen.</p>

          <Field label={`Zur Bestätigung tippe ${DELETE_CONFIRM_WORD} oder deine E-Mail-Adresse`} htmlFor="delete-confirm">
            <Input id="delete-confirm" data-autofocus value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" autoCapitalize="characters" spellCheck={false} placeholder={DELETE_CONFIRM_WORD} />
          </Field>

          {identity?.hasPassword ? (
            <Field label="Dein Passwort" htmlFor="delete-password" hint="Zur Sicherheit fragen wir noch einmal nach deinem Passwort.">
              <div className="relative">
                <Input id="delete-password" type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" className="pr-12" />
                <button type="button" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? "Passwort verbergen" : "Passwort anzeigen"} className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center text-muted hover:text-[var(--ink)]">{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button>
              </div>
            </Field>
          ) : identity ? (
            <div className="space-y-2">
              <p className="text-sm font-medium">Bestätige mit Google, dass du es bist</p>
              {fresh
                ? <StatusMessage tone="success">Mit Google bestätigt. Du kannst jetzt löschen.</StatusMessage>
                : <Button variant="secondary" onClick={reauthWithGoogle} loading={busy} full className="sm:w-auto">Mit Google bestätigen</Button>}
            </div>
          ) : null}

          <div id="delete-error">{error && <StatusMessage tone="danger">{error}</StatusMessage>}</div>
        </div>
      </Modal>
    </>
  );
}
