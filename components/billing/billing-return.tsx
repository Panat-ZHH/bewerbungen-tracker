"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Info, X } from "lucide-react";
import { RETURN_MESSAGE, readBillingReturn, stripBillingParams, type BillingReturn } from "./logic";

/**
 * Friendly message after coming back from the payment page (`?billing=success|cancel`). Removes the params from the URL
 * so a reload does not show it again. Renders nothing without the param.
 */
export function BillingReturnNotice({ onSuccess }: { onSuccess?: () => void }) {
  const [state, setState] = useState<BillingReturn | null>(null);
  useEffect(() => {
    const r = readBillingReturn(window.location.search);
    if (!r) return;
    setState(r); // eslint-disable-line react-hooks/set-state-in-effect -- reads the URL once after mount
    window.history.replaceState(null, "", `${window.location.pathname}${stripBillingParams(window.location.search)}${window.location.hash}`);
    if (r === "success") onSuccess?.();
  }, [onSuccess]);
  if (!state) return null;
  const m = RETURN_MESSAGE[state];
  const Icon = state === "success" ? CheckCircle2 : Info;
  return (
    <div role="status" data-billing-return={state} className={`status status-${m.tone} flex items-start gap-3`}>
      <Icon size={20} aria-hidden className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1"><p className="font-bold">{m.title}</p><p className="text-sm">{m.text}</p></div>
      <button type="button" onClick={() => setState(null)} className="-m-1 rounded-full p-1 hover:bg-[var(--hover)]" aria-label="Hinweis schliessen"><X size={16} aria-hidden /></button>
    </div>
  );
}
