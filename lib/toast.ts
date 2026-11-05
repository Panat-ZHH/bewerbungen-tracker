// Tiny framework-free toast store (module level) so any page can show feedback that survives route changes.
// Rendered by components/ui/toaster.tsx (mounted once in app/layout.tsx). Pure logic -> unit-tested in tests/ux.test.mjs.
export type ToastTone = "success" | "danger" | "info";
export type ToastAction = { label: string; onClick: () => void | Promise<void> };
export type ToastItem = { id: number; message: string; tone: ToastTone; action?: ToastAction; duration: number };
export type ToastInput = { message: string; tone?: ToastTone; action?: ToastAction; duration?: number };

const MAX_VISIBLE = 3;
let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());

export function toast(input: ToastInput): number {
  // same message twice in a row replaces the old toast instead of stacking
  items = items.filter((item) => item.message !== input.message);
  const tone = input.tone ?? "success";
  // errors and toasts with an undo action stay longer
  const duration = input.duration ?? (input.action ? 8000 : tone === "danger" ? 7000 : 4000);
  const item: ToastItem = { id: nextId++, message: input.message, tone, action: input.action, duration };
  items = [...items, item].slice(-MAX_VISIBLE);
  emit();
  return item.id;
}
export function dismissToast(id: number) { const before = items.length; items = items.filter((item) => item.id !== id); if (items.length !== before) emit(); }
export function getToasts(): ToastItem[] { return items; }
export function subscribeToasts(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function resetToasts() { items = []; emit(); }
