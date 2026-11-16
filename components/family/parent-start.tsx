"use client";

import { useState, type FormEvent } from "react";
import { ChevronDown, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { StatusMessage } from "@/components/ui/skeleton";
import { onlinePaymentEnabled } from "@/components/billing/logic";
import { createFamily } from "@/lib/family";
import { familyError } from "@/lib/family-core";
import { FAMILY_COPY } from "@/lib/family-copy";
import { FamilyStepper, type StepperItem } from "./family-stepper";
import { JoinForm } from "./invite-panel";
import { parentNextAction, STEP_TODO_TEXT } from "./parent-steps";

/**
 * Parent without a family = step 1 of the setup (BILLING-FLOW-SPEC §3.1, S1/S2). One primary action: "Familie erstellen".
 * "Dein Kind hat dir schon einen Code geschickt?" is a collapsed secondary option. With an invite link (`initialCode`) it is
 * the other way round: "Einladung annehmen" is primary and creating an own family is the secondary link.
 */
export function ParentStart({ email, initialCode, onChanged }: { email: string; initialCode: string; onChanged: () => void }) {
  void email; // kept in the contract signature (the old start screen showed the plan card)
  const online = onlinePaymentEnabled();
  const [createInstead, setCreateInstead] = useState(false);
  const inviteContext = !!initialCode && !createInstead;
  const next = parentNextAction(null, "none", { initialCode: inviteContext ? initialCode : "", online });
  const titles = { family: FAMILY_COPY.step1.title, child: FAMILY_COPY.step2.title, plan: FAMILY_COPY.step3.title };
  const items: StepperItem[] = next.steps.map((s) => ({ ...s, title: titles[s.id], line: s.state === "current" ? (inviteContext ? FAMILY_COPY.invite.title : STEP_TODO_TEXT.family) : STEP_TODO_TEXT[s.id] }));

  return (
    <div className="space-y-6">
      <FamilyStepper items={items} action={next.current} />
      <div className="max-w-2xl">
        {inviteContext ? (
          <div className="space-y-3" data-invite-context>
            <JoinForm initialCode={initialCode} onJoined={onChanged} title={FAMILY_COPY.invite.title} intro={FAMILY_COPY.invite.text} label={FAMILY_COPY.step1.joinLabel} submitLabel={FAMILY_COPY.invite.cta} primary />
            <Button variant="ghost" onClick={() => setCreateInstead(true)}>{FAMILY_COPY.invite.createInstead}</Button>
          </div>
        ) : (
          <CreateFamily onChanged={onChanged} />
        )}
      </div>
    </div>
  );
}

function CreateFamily({ onChanged }: { onChanged: () => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function create(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError("");
    try { await createFamily(name.trim() || "Meine Familie"); onChanged(); } catch (e) { setError(familyError(e)); setBusy(false); }
  }
  return (
    <div className="space-y-4">
      <form onSubmit={create} aria-labelledby="create-family" className="panel-flat space-y-4 p-5">
        <div className="space-y-1">
          <h2 id="create-family" className="text-heading"><Users size={18} className="mr-1.5 inline align-[-2px] text-[var(--brand)]" aria-hidden />{FAMILY_COPY.step1.title}</h2>
          <p className="text-body text-muted">{FAMILY_COPY.step1.text}</p>
        </div>
        {error && <StatusMessage tone="danger">{error}</StatusMessage>}
        <Field label={FAMILY_COPY.step1.nameLabel} htmlFor="family-name" hint={FAMILY_COPY.step1.nameHint}>
          <Input id="family-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoComplete="off" placeholder="Meine Familie" />
        </Field>
        <Button type="submit" loading={busy} data-primary-action="">{FAMILY_COPY.step1.cta}</Button>
      </form>
      <details className="group panel-flat px-5 py-3" data-join-toggle>
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 font-semibold [&::-webkit-details-marker]:hidden">
          {FAMILY_COPY.step1.joinToggle}
          <ChevronDown size={16} aria-hidden className="ml-auto shrink-0 transition-transform group-open:rotate-180" />
        </summary>
        <div className="space-y-3 pb-2 pt-1">
          <p className="text-body text-muted">{FAMILY_COPY.step1.joinText}</p>
          <JoinForm onJoined={onChanged} title={FAMILY_COPY.step1.joinLabel} label={FAMILY_COPY.step1.joinLabel} submitLabel={FAMILY_COPY.step1.joinCta} primary={false} />
        </div>
      </details>
    </div>
  );
}
