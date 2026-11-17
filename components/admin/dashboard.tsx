"use client";

import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/tabs";
import type { AdminMe } from "@/lib/admin/types";
import type { OpenDetail } from "./shared";
import { Overview, type Chip } from "./overview";
import { UsersTab } from "./users-tab";
import { SchoolsTab } from "./schools-tab";
import { AuditTab } from "./audit-tab";
import { UserDetail } from "./user-detail";
import { SchoolDetail } from "./school-detail";
import { SidePanel } from "./side-panel";
import { MfaStep } from "./mfa-step";

type Tab = "users" | "schools" | "audit";
type Detail = { kind: "user" | "school"; id: string } | null;

const TABS: { value: Tab; label: string }[] = [
  { value: "users", label: "Personen" },
  { value: "schools", label: "Schulen" },
  { value: "audit", label: "Protokoll" },
];

export function AdminDashboard({ me }: { me: AdminMe }) {
  const [tab, setTab] = useState<Tab>("users");
  const [chip, setChip] = useState<Chip>("all");
  const [detail, setDetail] = useState<Detail>(null);
  // Bumped after a change in the side panel, so numbers and lists behind it reload.
  const [version, setVersion] = useState(0);
  const [enrol, setEnrol] = useState(false);
  const open: OpenDetail = (target) => setDetail(target);
  const changed = () => setVersion((v) => v + 1);

  return (
    <div data-testid="admin-dashboard" className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <h1 className="text-title">Übersicht</h1>
        {me.email && <p className="text-small text-muted">Angemeldet als {me.email}</p>}
      </header>

      {!me.mfa_enrolled && (
        <div data-testid="admin-mfa-hint">
          {enrol ? (
            <MfaStep onDone={() => window.location.reload()} />
          ) : (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[var(--radius-lg)] border-[length:var(--border-w)] border-dashed border-[var(--outline)] px-4 py-2.5">
              <ShieldCheck size={18} aria-hidden className="shrink-0 text-[var(--brand)]" />
              <p className="text-small flex-1 text-muted">Tipp: Richte zusätzlich eine Authenticator-App ein. Dann fragt /admin jedes Mal nach einem Code.</p>
              <Button variant="ghost" size="sm" onClick={() => setEnrol(true)}>Jetzt einrichten</Button>
            </div>
          )}
        </div>
      )}

      <Overview version={version} chip={tab === "users" ? chip : "all"} onChip={(c) => { setChip(c); setTab("users"); }} onSchools={() => setTab("schools")} />

      <div className="space-y-5">
        <Segmented<Tab>
          label="Bereiche"
          value={tab}
          onChange={setTab}
          options={TABS.map((t) => ({ value: t.value, label: <span data-testid={`admin-tab-${t.value}`}>{t.label}</span> }))}
        />
        <div role="tabpanel" aria-label={TABS.find((t) => t.value === tab)?.label}>
          {tab === "users" && <UsersTab onOpen={open} version={version} chip={chip} onChip={setChip} selectedId={detail?.kind === "user" ? detail.id : null} />}
          {tab === "schools" && <SchoolsTab onOpen={open} version={version} />}
          {tab === "audit" && <AuditTab onOpen={open} version={version} />}
        </div>
      </div>

      <SidePanel open={!!detail} onClose={() => setDetail(null)} title={detail?.kind === "school" ? "Schule" : "Person"} testId="admin-panel">
        {detail?.kind === "user" && <UserDetail key={detail.id} id={detail.id} selfId={me.user_id} onOpen={open} onChanged={changed} onDeleted={() => { setDetail(null); changed(); }} />}
        {detail?.kind === "school" && <SchoolDetail key={detail.id} id={detail.id} onOpen={open} onChanged={changed} />}
      </SidePanel>
    </div>
  );
}
