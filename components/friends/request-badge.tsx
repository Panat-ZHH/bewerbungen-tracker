import { badgeLabel, badgeText } from "@/lib/friend-requests";

/** Small red counter bubble for the Freunde nav entries. Renders nothing at 0. Place inside a `relative` parent. */
export function RequestBadge({ count, className = "" }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <span role="img" aria-label={badgeLabel(count)} data-testid="friend-request-badge" className={`pointer-events-none absolute flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-[var(--badge-ring)] bg-[var(--badge-bg)] px-1 text-[10px] font-bold leading-none text-[var(--badge-fg)] tabular-nums ${className}`}>
      <span aria-hidden="true">{badgeText(count)}</span>
    </span>
  );
}
