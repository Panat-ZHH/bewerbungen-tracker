"use client";

import { useEffect, useState } from "react";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Figures } from "@/components/ui/figures";
import { StatusMessage } from "@/components/ui/skeleton";
import { Segmented } from "@/components/ui/tabs";
import type { SignupStats } from "@/lib/admin/types";
import { adminFetch, errorText } from "./api";
import { fmtDate, type OpenDetail } from "./shared";
import { ListSkeleton, UserList } from "./users-tab";

const weekday = new Intl.DateTimeFormat("de-CH", { weekday: "short", timeZone: "UTC" });
const dayMonth = new Intl.DateTimeFormat("de-CH", { day: "numeric", month: "numeric", timeZone: "UTC" });

export function SignupsTab({ onOpen, version }: { onOpen: OpenDetail; version: number }) {
  const [days, setDays] = useState<"7" | "30">("7");
  const [retry, setRetry] = useState(0);
  const key = `${days}|${version}|${retry}`;
  const [result, setResult] = useState<{ key: string; data?: SignupStats; error?: string } | null>(null);

  useEffect(() => {
    let alive = true;
    adminFetch<SignupStats>(`/api/admin/signups?days=${days}`).then((res) => {
      if (alive) setResult(res.ok ? { key, data: res.data } : { key, error: errorText(res) });
    });
    return () => { alive = false; };
  }, [days, key]);

  const loading = !result || result.key !== key;
  const data = !loading ? result?.data : undefined;

  return (
    <div className="space-y-6">
      <Segmented<"7" | "30"> label="Zeitraum" value={days} onChange={setDays} options={[{ value: "7", label: "7 Tage" }, { value: "30", label: "30 Tage" }]} />
      {!loading && result?.error && (
        <div className="space-y-3">
          <StatusMessage tone="danger">{result.error}</StatusMessage>
          <Button variant="secondary" size="sm" onClick={() => setRetry((r) => r + 1)}>Nochmals laden</Button>
        </div>
      )}
      {loading && <ListSkeleton />}
      {data && (
        <>
          <div data-testid="admin-signups-total">
            <Figures label="Neue Konten" items={[{ label: "neue Konten", value: data.total, hint: `in den letzten ${data.days} Tagen` }]} />
          </div>
          <DayBars byDay={data.by_day} />
          {data.users.length === 0
            ? <EmptyState icon={<UserPlus />} title="Noch niemand Neues" description="In diesem Zeitraum hat sich niemand registriert." />
            : <UserList rows={data.users} onOpen={onOpen} />}
        </>
      )}
    </div>
  );
}

/** One flat bar per day (tokens only). Screen readers get the numbers as a list. */
function DayBars({ byDay }: { byDay: SignupStats["by_day"] }) {
  const max = Math.max(1, ...byDay.map((d) => d.count));
  const short = byDay.length <= 7;
  const label = (day: string) => (short ? weekday : dayMonth).format(new Date(`${day}T12:00:00Z`));
  return (
    <figure className="space-y-2">
      <figcaption className="sr-only">Neue Konten pro Tag</figcaption>
      <ul className="flex h-32 items-end gap-1 border-b-[length:var(--border-w)] border-[var(--outline)] sm:gap-1.5">
        {byDay.map((d) => (
          <li key={d.day} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`${fmtDate(d.day)}: ${d.count}`}>
            <span className="sr-only">{fmtDate(d.day)}: {d.count}</span>
            {short && <span aria-hidden className="text-[11px] font-semibold tabular text-muted">{d.count}</span>}
            <span aria-hidden className="block w-full rounded-t-[var(--radius-sm)] border-[length:var(--border-w)] border-b-0 border-[var(--outline-fill)] bg-[var(--brand)]"
              style={{ height: `${Math.max(d.count ? 6 : 0, (d.count / max) * 82)}%`, borderWidth: d.count ? undefined : 0 }} />
          </li>
        ))}
      </ul>
      <div aria-hidden className="flex justify-between gap-1 text-[11px] text-muted">
        {short
          ? byDay.map((d) => <span key={d.day} className="flex-1 text-center">{label(d.day)}</span>)
          : byDay.length > 0 && <><span>{label(byDay[0].day)}</span><span>{label(byDay[byDay.length - 1].day)}</span></>}
      </div>
    </figure>
  );
}
