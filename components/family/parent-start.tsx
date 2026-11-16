"use client";

import { useState, type FormEvent } from "react";
import { Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { StatusMessage } from "@/components/ui/skeleton";
import { createFamily } from "@/lib/family";
import { familyError } from "@/lib/family-core";
import { JoinForm } from "./invite-panel";
import { PlanCard } from "./plan-card";

/** Parent without a family: create one or join with a code from the child. */
export function ParentStart({ email, initialCode, onChanged }: { email: string; initialCode: string; onChanged: () => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function create(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError("");
    try { await createFamily(name.trim() || "Meine Familie"); onChanged(); } catch (e) { setError(familyError(e)); setBusy(false); }
  }
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <form onSubmit={create} aria-labelledby="create-family" className="panel-flat space-y-3 p-5">
        <h2 id="create-family" className="text-heading"><Users size={18} className="mr-1.5 inline align-[-2px] text-[var(--brand)]" aria-hidden />Familie erstellen</h2>
        <p className="text-body text-muted">Erstelle zuerst deine Familie. Danach lädst du dein Kind mit einem Code ein.</p>
        {error && <StatusMessage tone="danger">{error}</StatusMessage>}
        <Field label="Name der Familie" htmlFor="family-name" hint="Zum Beispiel «Familie Meier»"><Input id="family-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoComplete="off" /></Field>
        <Button type="submit" loading={busy}>Familie erstellen</Button>
      </form>
      <div className="space-y-6">
        <JoinForm initialCode={initialCode} onJoined={onChanged} title="Code von deinem Kind" intro="Hat dein Kind dich eingeladen? Gib den Code hier ein." />
        <PlanCard plan={null} email={email} isParent />
      </div>
    </div>
  );
}
