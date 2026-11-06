"use client";

import { useEffect, useSyncExternalStore } from "react";
import { CheckCircle2, Info, TriangleAlert, X } from "lucide-react";
import { dismissToast, getToasts, subscribeToasts, type ToastItem } from "@/lib/toast";

const empty: ToastItem[] = [];
const icons = { success: CheckCircle2, danger: TriangleAlert, info: Info } as const;

/** Mount once (app/layout.tsx). Region is always in the DOM so screen readers announce new toasts (aria-live). */
export function Toaster() {
  const items = useSyncExternalStore(subscribeToasts, getToasts, () => empty);
  return (
    <div aria-live="polite" aria-atomic="false" role="region" aria-label="Hinweise" className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--tabbar-h)+var(--safe-bottom)+12px)] z-[150] flex flex-col items-center gap-2 px-3 md:bottom-6">
      {items.map((item) => <ToastCard key={item.id} item={item} />)}
    </div>
  );
}

function ToastCard({ item }: { item: ToastItem }) {
  const Icon = icons[item.tone];
  useEffect(() => {
    const timer = window.setTimeout(() => dismissToast(item.id), item.duration);
    return () => window.clearTimeout(timer);
  }, [item.id, item.duration]);
  return (
    <div role={item.tone === "danger" ? "alert" : "status"} className={`pointer-events-auto animate-rise toast status status-${item.tone === "info" ? "info" : item.tone} w-full max-w-md items-center !py-1.5 !pr-1.5`}>
      <Icon aria-hidden size={17} className="shrink-0" />
      <p className="min-w-0 flex-1 py-1.5 font-medium">{item.message}</p>
      {item.action && (
        <button type="button" onClick={async () => { dismissToast(item.id); await item.action?.onClick(); }} className="min-h-11 shrink-0 rounded-full px-4 text-sm font-semibold underline underline-offset-2 hover:bg-black/5">{item.action.label}</button>
      )}
      <button type="button" onClick={() => dismissToast(item.id)} aria-label="Hinweis schliessen" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-black/5"><X size={16} /></button>
    </div>
  );
}
