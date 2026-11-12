"use client";

import { useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { StatusMessage } from "@/components/ui/skeleton";
import { supabase } from "@/lib/supabase";
import { passwordChangeProblem, withSupport } from "@/lib/account-deletion";
import { SettingsSection } from "./section";

/** Only shown for accounts that sign in with e-mail + password (Google accounts have no password here). */
export function PasswordChangeCard() {
  const [email, setEmail] = useState<string | null>(null);
  const [hasPassword, setHasPassword] = useState<boolean | null>(null);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "danger"; text: string } | null>(null);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? null);
      setHasPassword(Boolean(data.user?.identities?.some((i) => i.provider === "email")));
    });
  }, []);

  useEffect(() => { if (notice) document.getElementById("password-notice")?.scrollIntoView({ block: "center", behavior: "smooth" }); }, [notice]);

  if (!hasPassword) return null;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setNotice(null);
    const problem = passwordChangeProblem(current, next, repeat);
    if (problem) { setNotice({ tone: "danger", text: problem }); return; }
    setBusy(true);
    try {
      const check = await supabase.auth.signInWithPassword({ email: email ?? "", password: current });
      if (check.error) { setNotice({ tone: "danger", text: /invalid|credentials/i.test(check.error.message) ? "Das aktuelle Passwort stimmt nicht." : withSupport("Die Anmeldung hat nicht geklappt.") }); return; }
      const { error } = await supabase.auth.updateUser({ password: next });
      if (error) { setNotice({ tone: "danger", text: /same|different/i.test(error.message) ? "Das neue Passwort muss sich vom aktuellen unterscheiden." : withSupport("Das Passwort konnte nicht geändert werden.") }); return; }
      setCurrent(""); setNext(""); setRepeat("");
      setNotice({ tone: "success", text: "Dein Passwort wurde geändert." });
    } catch {
      setNotice({ tone: "danger", text: withSupport("Keine Verbindung. Bitte prüfe dein Internet.") });
    } finally {
      setBusy(false);
    }
  }

  return (
    <SettingsSection data-testid="password-card" title="Passwort ändern" description="Wähle ein neues Passwort mit mindestens 8 Zeichen.">
      <form onSubmit={submit} className="max-w-md space-y-3" noValidate>
        <Field label="Aktuelles Passwort" htmlFor="pw-current"><Input id="pw-current" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} /></Field>
        <Field label="Neues Passwort" htmlFor="pw-new"><Input id="pw-new" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} /></Field>
        <Field label="Neues Passwort wiederholen" htmlFor="pw-repeat"><Input id="pw-repeat" type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} /></Field>
        <div id="password-notice">{notice && <StatusMessage tone={notice.tone} icon={notice.tone === "success" ? <CheckCircle2 /> : undefined}>{notice.text}</StatusMessage>}</div>
        <Button type="submit" variant="secondary" loading={busy} className="sm:min-h-11">Passwort ändern</Button>
      </form>
    </SettingsSection>
  );
}
