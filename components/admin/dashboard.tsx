"use client";

import { useState } from "react";
import { ChevronLeft, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Segmented } from "@/components/ui/tabs";
import type { AdminMe } from "@/lib/admin/types";
import type { OpenDetail } from "./shared";
import { UsersTab } from "./users-tab";
import { SignupsTab } from "./signups-tab";
import { SchoolsTab } from "./schools-tab";
import { AuditTab } from "./audit-tab";
import { UserDetail } from "./user-detail";
import { SchoolDetail } from "./school-detail";
import { MfaStep } from "./mfa-step";

type Tab = "users" | "signups" | "schools" | "audit";
type Detail = { kind: "user" | "school"; id: string } | null;

const TABS: { value: Tab; label: string }[] = [
  { value: "users", label: "Personen" },
  { value: "signups", label: "Neu" },
  { value: "schools", label: "Schulen" },
  { value: "audit", label: "Protokoll" },
];

export function AdminDashboard({ me }: { me: AdminMe }) {
  const [tab, setTab] = useState<Tab>("users");
  const [detail, setDetail] = useState<Detail>(null);
  // Bumped after a change in a detail view, so the list behind it reloads.
  const [version, setVersion] = useState(0);
  const [enrol, setEnrol] = useState(false);
  const open: OpenDetail = (target) => { setDetail(target); window.scrollTo({ top: 0 }); };
  const changed = () => setVersion((v) => v + 1);

  return (
    <div data-testid="admin-dashboard">
      <PageHeader title="Admin" description={me.email ? `Angemeldet als ${me.email}` : undefined} />
      {!me.mfa_enrolled && (
        <div className="mb-6 space-y-3" data-testid="admin-mfa-hint">
          {enrol ? (
            <MfaStep onDone={() => window.location.reload()} />
          ) : (
            <div className="flex flex-wrap items-center gap-3 rounded-[var(--radius-lg)] border-[length:var(--border-w)] border-[var(--outline-fill)] px-4 py-3">
              <ShieldCheck size={20} aria-hidden className="text-[var(--brand)]" />
              <p className="text-body flex-1 text-muted">
                Du bist mit Google angemeldet (Googles eigene Zwei-Faktor-Sicherung gilt). Empfohlen: zusätzlich eine Authenticator-App einrichten. Danach fragt /admin jedes Mal nach dem Code.
              </p>
              <Button variant="secondary" size="sm" onClick={() => setEnrol(true)}>Zwei-Faktor einrichten</Button>
            </div>
          )}
        </div>
      )}
      <div className="mb-6">
        <Segmented<Tab>
          label="Bereiche"
          value={tab}
          onChange={(t) => { setTab(t); setDetail(null); }}
          options={TABS.map((t) => ({ value: t.value, label: <span data-testid={`admin-tab-${t.value}`}>{t.label}</span> }))}
        />
      </div>

      {detail && (
        <div className="mb-4">
          <Button variant="ghost" size="sm" onClick={() => setDetail(null)} icon={<ChevronLeft size={16} aria-hidden />}>Zurück zur Liste</Button>
        </div>
      )}

      {/* Lists stay mounted (hidden) while a detail is open, so filters and page survive going back. */}
      <div role="tabpanel" hidden={!!detail}>
        {tab === "users" && <UsersTab onOpen={open} version={version} />}
        {tab === "signups" && <SignupsTab onOpen={open} version={version} />}
        {tab === "schools" && <SchoolsTab onOpen={open} version={version} />}
        {tab === "audit" && <AuditTab onOpen={open} version={version} />}
      </div>

      {detail?.kind === "user" && <UserDetail key={detail.id} id={detail.id} selfId={me.user_id} onOpen={open} onChanged={changed} onDeleted={() => { setDetail(null); changed(); }} />}
      {detail?.kind === "school" && <SchoolDetail key={detail.id} id={detail.id} onOpen={open} onChanged={changed} />}
    </div>
  );
}
