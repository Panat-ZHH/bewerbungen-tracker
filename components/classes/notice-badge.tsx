"use client";

import { useNotices } from "@/lib/notices";

/** Unread-notice counter for the "Klassen" nav entries (students only). Place inside a `relative` parent. */
export function NoticeBadge({ enabled, className = "" }: { enabled: boolean; className?: string }) {
  const { unread } = useNotices(enabled);
  if (!enabled || unread <= 0) return null;
  const label = unread === 1 ? "1 ungelesene Mitteilung" : `${unread} ungelesene Mitteilungen`;
  return (
    <span role="img" aria-label={label} data-testid="notice-badge" className={`pointer-events-none absolute flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-[var(--badge-ring)] bg-[var(--badge-bg)] px-1 text-[10px] font-bold leading-none text-[var(--badge-fg)] tabular-nums ${className}`}>
      <span aria-hidden="true">{unread > 9 ? "9+" : unread}</span>
    </span>
  );
}
