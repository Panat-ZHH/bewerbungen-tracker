import { ChevronDown } from "lucide-react";

export type TocItem = { id: string; title: string };

const itemCls = "flex min-h-11 items-center gap-3 rounded-[var(--radius-md)] px-2.5 py-1.5 text-sm font-semibold text-[var(--ink)] hover:bg-[var(--hover)] lg:min-h-9";
const numCls = "font-display w-6 shrink-0 text-right text-base font-extrabold tabular-nums text-[var(--muted)]";

function List({ items }: { items: TocItem[] }) {
  return (
    <ol className="space-y-0.5">
      {items.map((it, i) => (
        <li key={it.id}><a href={`#${it.id}`} className={itemCls}><span aria-hidden className={numCls}>{i + 1}</span>{it.title}</a></li>
      ))}
    </ol>
  );
}

/** Table of contents: collapsible on phones, sticky side column from lg up. Plain anchors, no JS. */
export function Toc({ items }: { items: TocItem[] }) {
  return (
    <>
      <details className="group panel-flat mb-8 lg:hidden">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 font-semibold marker:content-none [&::-webkit-details-marker]:hidden">
          Inhalt der Anleitung <ChevronDown size={18} strokeWidth={2.4} aria-hidden className="transition-transform group-open:rotate-180" />
        </summary>
        <nav aria-label="Inhalt der Anleitung (mobil)" className="border-t-2 border-dashed border-[var(--line)] p-2"><List items={items} /></nav>
      </details>
      <nav aria-label="Inhalt der Anleitung" className="sticky top-24 hidden max-h-[calc(100dvh-7rem)] overflow-y-auto lg:block">
        <p className="text-label mb-2 px-2.5 uppercase tracking-wide">Inhalt</p>
        <List items={items} />
      </nav>
    </>
  );
}
