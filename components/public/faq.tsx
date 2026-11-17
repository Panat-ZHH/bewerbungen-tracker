import { Plus } from "lucide-react";

export type FaqItem = { q: string; a: React.ReactNode };

/** Accordion built on native <details>: keyboard accessible, no JS. Calm website style (thin rules, plus icon). */
export function Faq({ items }: { items: FaqItem[] }) {
  return (
    <div className="s-faq">
      {items.map((item) => (
        <details key={item.q}>
          <summary>
            {item.q}
            <Plus size={20} strokeWidth={2} aria-hidden />
          </summary>
          <div className="s-faq-a">{item.a}</div>
        </details>
      ))}
    </div>
  );
}
