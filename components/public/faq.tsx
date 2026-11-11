import { ChevronDown } from "lucide-react";

export type FaqItem = { q: string; a: React.ReactNode };

/** Accordion built on native <details>: keyboard accessible, no JS. */
export function Faq({ items }: { items: FaqItem[] }) {
  return (
    <div className="divide-y divide-[var(--line)] overflow-hidden rounded-[var(--radius-lg)] border border-[var(--outline)] bg-[var(--surface)] shadow-[var(--shadow-sm)]">
      {items.map((item) => (
        <details key={item.q} className="group">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 px-4 py-3.5 text-[15px] font-semibold marker:content-none hover:bg-[var(--hover)] [&::-webkit-details-marker]:hidden">
            {item.q}
            <ChevronDown size={18} aria-hidden className="shrink-0 text-[var(--muted)] transition-transform group-open:rotate-180" />
          </summary>
          <div className="px-4 pb-4 text-[15px] leading-relaxed text-muted">{item.a}</div>
        </details>
      ))}
    </div>
  );
}
