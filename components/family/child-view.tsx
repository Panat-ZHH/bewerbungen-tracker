"use client";

import { useState } from "react";
import { Eye, LogOut, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { StatusMessage } from "@/components/ui/skeleton";
import { ConsentSwitch } from "@/components/classes/consent-switches";
import { leaveFamily, setShare } from "@/lib/family";
import { onlinePaymentEnabled } from "@/components/billing/logic";
import { childPlanLine, consentNotice, DEFAULT_SHARE, familyError, nextShare, parentsOf, SHARE_LABELS, type FamilyMember, type FamilyPlan, type MyFamily, type ShareSettings } from "@/lib/family-core";
import { PlanCard } from "./plan-card";
import { StudentStart } from "./student-start";

/**
 * Child side of a family: consent notice (under 16), share switches (own row only), who sees it, leave.
 * No parent connected yet (the family was auto-created by the first invite): the "Deine Eltern verbinden" card (StudentStart)
 * with the still open link comes first. The plan is a neutral line (S8): never payment details, no billing API call.
 */
export function ChildView({ family, me, email, onChanged, online = onlinePaymentEnabled() }: { family: MyFamily; me: FamilyMember | null; email: string; onChanged: () => void; online?: boolean }) {
  const [share, setShareState] = useState<ShareSettings>(family.myShare ?? DEFAULT_SHARE);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [leaving, setLeaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const consent = me?.consentStatus ?? "not_required";
  const notice = consentNotice(consent);
  const parents = parentsOf(family);
  const connected = parents.length > 0;

  async function toggle(key: keyof ShareSettings, value: boolean) {
    const before = share;
    const next = nextShare(share, key, value);
    setShareState(next); setSaving(true); setError("");
    try { await setShare(next); } catch (e) { setShareState(before); setError(familyError(e)); } finally { setSaving(false); }
  }
  async function leave() {
    setBusy(true); setError("");
    try { await leaveFamily(); setLeaving(false); onChanged(); } catch (e) { setError(familyError(e)); setLeaving(false); } finally { setBusy(false); }
  }

  return (
    <div className="space-y-6" data-student-step={connected ? "joined" : undefined}>
      {!connected && <StudentStart family={family} initialCode="" onChanged={onChanged} />}
      {notice && <StatusMessage tone={notice.tone}><strong className="block">{notice.title}</strong>{notice.text}</StatusMessage>}
      {error && <StatusMessage tone="danger">{error}</StatusMessage>}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <section aria-labelledby="family-share" className="panel-flat min-w-0 p-5">
          <h2 id="family-share" className="text-heading"><Eye size={18} className="mr-1.5 inline align-[-2px] text-[var(--brand)]" aria-hidden />Was deine Familie sieht</h2>
          <p className="mt-1 text-body text-muted">Du entscheidest. Notizen, Lohnangaben, Kontakte, Links, Dokumente und deine Klasse bleiben immer privat. Du kannst jederzeit etwas ausschalten, dann sehen deine Eltern es sofort nicht mehr.</p>
          {consent === "pending" && <p className="mt-2 text-small font-semibold">Deine Einstellungen gelten, sobald ein Elternteil zugestimmt hat.</p>}
          <div className="rows mt-2" aria-busy={saving}>
            {SHARE_LABELS.map((s) => <ConsentSwitch key={s.key} label={s.label} description={share[s.key] ? s.on : s.off} checked={share[s.key]} disabled={saving} onChange={(v) => toggle(s.key, v)} />)}
          </div>
          <p className="mt-3 text-small text-muted">{parents.length ? `Eltern in deiner Familie: ${parents.map((p) => p.displayName).join(", ")}` : "Noch kein Elternteil in deiner Familie."}</p>
        </section>
        <div className="min-w-0 space-y-6">
          {online ? <ChildPlanLine plan={family.plan} /> : <PlanCard plan={family.plan} email={email} familyId={family.id} />}
          <Button variant="ghost" onClick={() => setLeaving(true)} icon={<LogOut size={16} />}>Familie verlassen</Button>
        </div>
      </div>
      <Modal open={leaving} onClose={() => setLeaving(false)} title="Familie verlassen?"
        footer={<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button variant="secondary" onClick={() => setLeaving(false)}>Abbrechen</Button><Button variant="danger" loading={busy} onClick={leave}>Verlassen</Button></div>}>
        <p className="text-body">Danach sieht deine Familie nichts mehr von dir. Dein Konto, deine Bewerbungen und dein Dorf bleiben bestehen.</p>
      </Modal>
    </div>
  );
}

/** Compact, neutral plan line for the child (S8): "Familienpaket aktiv" or "Für dich bleibt WendApply kostenlos". */
export function ChildPlanLine({ plan }: { plan: FamilyPlan | null }) {
  const line = childPlanLine(plan);
  return (
    <section aria-labelledby="child-plan" className="panel-flat space-y-2 p-5" data-billing-state="child">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="child-plan" className="text-heading"><Sparkles size={18} className="mr-1.5 inline align-[-2px] text-[var(--brand)]" aria-hidden />Familienpaket</h2>
        {line.badge && <Badge tone="success">{line.badge}</Badge>}
      </div>
      <p className="text-body text-muted" data-testid="child-plan-text">{line.text}</p>
    </section>
  );
}
