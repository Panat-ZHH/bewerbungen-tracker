"use client";

import { FormEvent, useState } from "react";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { StatusMessage } from "@/components/ui/skeleton";
import { sendFriendRequest } from "@/lib/social";
import { friendlyError } from "./shared";

export function AddFriend({ onChanged }: { onChanged: () => void }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    const entry = value.trim();
    if (!entry) { setError("Gib einen Code oder eine E-Mail-Adresse ein."); setSuccess(""); return; }
    setBusy(true); setError(""); setSuccess("");
    try {
      const result = await sendFriendRequest(entry);
      setSuccess(result.status === "accepted" ? "Ihr seid jetzt befreundet. Die Person hatte dir auch schon geschrieben." : "Anfrage ist raus. Sobald sie angenommen wird, siehst du die Person hier.");
      setValue("");
      onChanged();
    } catch (reason) {
      setError(friendlyError(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="add-friend-title" className="animate-rise">
        <h2 id="add-friend-title" className="text-heading">Freund:in hinzufügen</h2>
        <form onSubmit={submit} className="mt-3 space-y-3" noValidate>
          <Field label="Code oder E-Mail" htmlFor="friend-entry" hint="Den Code findest du bei deiner Freundin oder deinem Freund.">
            <Input id="friend-entry" className="text-base! sm:text-base!" value={value} onChange={(e) => setValue(e.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder="z. B. K7P2QXMA oder name@beispiel.ch" />
          </Field>
          <Button type="submit" variant="secondary" className="min-h-11 sm:min-h-11" loading={busy} full icon={<UserPlus size={16} />}>Anfrage senden</Button>
          {error && <StatusMessage tone="danger">{error}</StatusMessage>}
          {success && <StatusMessage tone="success">{success}</StatusMessage>}
        </form>
    </section>
  );
}
