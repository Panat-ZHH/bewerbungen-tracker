"use client";

import { useState } from "react";
import { ShieldCheck, UserMinus, Users } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { StatusMessage } from "@/components/ui/skeleton";
import { removeMember, setConsent } from "@/lib/family";
import { childrenOf, CONSENT_LABEL, CONSENT_TONE, familyError, parentsOf, seatUsage, sharingActive, type FamilyMember, type MyFamily } from "@/lib/family-core";
import { ChildOverview } from "./child-overview";
import { InvitePanel } from "./invite-panel";
import { PlanCard } from "./plan-card";

type Confirm = { kind: "grant" | "withdraw" | "remove"; child: FamilyMember } | null;

/** Parent dashboard: plan, children with consent status, the selected child's shared overview, invite a child. */
export function ParentView({ family, email, onChanged }: { family: MyFamily; email: string; onChanged: () => void }) {
  const kids = childrenOf(family);
  const [selected, setSelected] = useState<string | null>(kids[0]?.userId ?? null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const seats = seatUsage(family);
  const current = kids.find((k) => k.userId === selected) ?? kids[0] ?? null;

  async function run() {
    if (!confirm) return;
    setBusy(true); setError("");
    try {
      if (confirm.kind === "remove") await removeMember(confirm.child.userId);
      else await setConsent(confirm.child.userId, confirm.kind === "grant");
      setConfirm(null); onChanged();
    } catch (e) { setError(familyError(e)); setConfirm(null); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-6">
      {error && <StatusMessage tone="danger">{error}</StatusMessage>}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <section aria-labelledby="family-children" className="panel-flat min-w-0 space-y-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="family-children" className="text-heading"><Users size={18} className="mr-1.5 inline align-[-2px] text-[var(--brand)]" aria-hidden />Kinder</h2>
            <span className="text-small text-muted">{seats.children.used} von {seats.children.limit} {seats.children.limit === 1 ? "Platz" : "Plätzen"} belegt</span>
          </div>
          {kids.length === 0 ? <p className="text-body text-muted">Noch kein Kind in deiner Familie. Erstelle unten einen Einladungscode.</p> : (
            <ul className="space-y-2" aria-label="Kinder in deiner Familie">
              {kids.map((k) => (
                <li key={k.userId} className={`rounded-[var(--radius-lg)] border-[length:var(--border-w)] p-3 ${current?.userId === k.userId ? "border-[var(--outline-fill)]" : "border-[var(--line)]"}`}>
                  <div className="flex flex-wrap items-center gap-3">
                    <Avatar name={k.displayName} size="sm" />
                    <button type="button" onClick={() => setSelected(k.userId)} aria-pressed={current?.userId === k.userId} className="min-h-11 min-w-0 flex-1 text-left font-bold">{k.displayName}</button>
                    <Badge tone={CONSENT_TONE[k.consentStatus]}>{k.status === "pending" ? "Einladung offen" : CONSENT_LABEL[k.consentStatus]}</Badge>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(k.consentStatus === "pending" || k.consentStatus === "withdrawn") && <Button size="sm" onClick={() => setConfirm({ kind: "grant", child: k })} icon={<ShieldCheck size={14} />}>Zustimmung geben</Button>}
                    {k.consentStatus === "granted" && <Button size="sm" variant="secondary" onClick={() => setConfirm({ kind: "withdraw", child: k })}>Zustimmung zurückziehen</Button>}
                    <Button size="sm" variant="ghost" onClick={() => setConfirm({ kind: "remove", child: k })} icon={<UserMinus size={14} />}>Entfernen</Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {current && (
            <div className="border-t-2 border-dashed border-[var(--line)] pt-4" aria-live="polite">
              <h3 className="mb-3 text-heading">Überblick: {current.displayName}</h3>
              {sharingActive(current) ? <ChildOverview key={current.userId} childId={current.userId} name={current.displayName} /> : (
                <p className="text-body text-muted">{current.consentStatus === "pending" ? `${current.displayName} ist unter 16. Sobald du zustimmst, siehst du hier, was ${current.displayName} teilt.` : current.status === "pending" ? "Die Einladung ist noch nicht angenommen." : "Teilen ist pausiert."}</p>
              )}
            </div>
          )}
        </section>
        <div className="min-w-0 space-y-6">
          <PlanCard plan={family.plan} email={email} />
          <InvitePanel direction="parent_invites_child" disabled={seats.children.full} disabledReason="Alle Plätze für Kinder sind belegt. Für weitere Kinder kannst du über «Zugang anfragen» mehr Plätze anfragen." />
          {parentsOf(family).length > 0 && <p className="text-small text-muted">Eltern in dieser Familie: {parentsOf(family).map((p) => p.displayName).join(", ")}</p>}
        </div>
      </div>

      <Modal open={!!confirm} onClose={() => setConfirm(null)} title={confirm?.kind === "grant" ? "Zustimmung geben?" : confirm?.kind === "withdraw" ? "Zustimmung zurückziehen?" : "Aus der Familie entfernen?"}
        footer={<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button variant="secondary" onClick={() => setConfirm(null)}>Abbrechen</Button><Button variant={confirm?.kind === "remove" ? "danger" : "primary"} loading={busy} onClick={run}>{confirm?.kind === "grant" ? "Ja, ich stimme zu" : confirm?.kind === "withdraw" ? "Zurückziehen" : "Entfernen"}</Button></div>}>
        {confirm?.kind === "grant" && <p className="text-body">Ich bin erziehungsberechtigt für {confirm.child.displayName} und bin einverstanden, dass {confirm.child.displayName} WendApply mit unserer Familie nutzt. {confirm.child.displayName} entscheidet selbst, was geteilt wird, und kann das Teilen jederzeit stoppen. Du kannst die Zustimmung jederzeit zurückziehen.</p>}
        {confirm?.kind === "withdraw" && <p className="text-body">Danach siehst du nichts mehr von {confirm.child.displayName}. Das Konto und die Bewerbungen von {confirm.child.displayName} bleiben bestehen.</p>}
        {confirm?.kind === "remove" && <p className="text-body">{confirm.child.displayName} verlässt die Familie. Das eigene Konto mit allen Bewerbungen bleibt bestehen, nur das Teilen endet.</p>}
      </Modal>
    </div>
  );
}
