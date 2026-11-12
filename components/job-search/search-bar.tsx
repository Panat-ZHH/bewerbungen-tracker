"use client";

import { forwardRef, useEffect, useId, useImperativeHandle, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { History, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/tabs";
import { suggestQueries, synonymHints } from "./engine";

export type SearchTab = "apprenticeship" | "praktikum" | "job";
export type SearchBarHandle = { focus: () => void };

const KEYBOARD_QUERY = "(hover: hover) and (pointer: fine)";
/** True on devices with a mouse/keyboard; false on touch-only phones (no "/" hint there). */
export function useHasKeyboard(): boolean {
  return useSyncExternalStore(
    (notify) => { const m = window.matchMedia(KEYBOARD_QUERY); m.addEventListener("change", notify); return () => m.removeEventListener("change", notify); },
    () => window.matchMedia(KEYBOARD_QUERY).matches,
    () => false,
  );
}

export const SearchBar = forwardRef<SearchBarHandle, { query: string; onQueryChange: (q: string) => void; onSubmit: (q: string) => void; tab: SearchTab; onTabChange: (t: SearchTab) => void; recent: string[]; onClearRecent: () => void; loading: boolean }>(
  function SearchBar({ query, onQueryChange, onSubmit, tab, onTabChange, recent, onClearRecent, loading }, ref) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState(-1);
    const listId = useId();
    const hasKeyboard = useHasKeyboard();
    useImperativeHandle(ref, () => ({ focus: () => inputRef.current?.focus() }));

    const suggestions = useMemo(() => {
      const typed = suggestQueries(query);
      const items = (query.trim().length < 2 ? recent.map((value) => ({ value, recent: true })) : typed.map((value) => ({ value, recent: false })));
      return items;
    }, [query, recent]);
    const hints = useMemo(() => synonymHints(query), [query]);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    useEffect(() => setActive(-1), [suggestions.length]);

    function choose(value: string) { onQueryChange(value); setOpen(false); onSubmit(value); }

    return (
      <div className="space-y-3">
        <Segmented<SearchTab> label="Art der Suche" value={tab} onChange={onTabChange} options={[{ value: "apprenticeship", label: "Lehrstelle" }, { value: "praktikum", label: "Praktikum" }, { value: "job", label: "Job" }]} />
        <form role="search" onSubmit={(e) => { e.preventDefault(); setOpen(false); onSubmit(query); }} className="relative flex flex-col gap-3 sm:flex-row sm:items-start">
          <div className="relative min-w-0 flex-1">
            {/* The bar is one sticker: ink contour + hard shadow, blue contour while the field has focus. */}
            <div className="flex min-h-14 items-center rounded-xl border-[length:var(--border-w)] border-[var(--outline)] bg-[var(--surface)] pl-4 shadow-[var(--shadow-md)] transition-[box-shadow,border-color] duration-150 focus-within:border-[var(--brand)] focus-within:shadow-[3px_3px_0_var(--brand)]">
            <Search size={20} strokeWidth={2.4} aria-hidden className="pointer-events-none shrink-0 text-[var(--ink)]" />
            <input
              ref={inputRef}
              role="combobox"
              aria-expanded={open && suggestions.length > 0}
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
              aria-label="Beruf oder Stelle suchen"
              autoComplete="off"
              maxLength={80}
              value={query}
              placeholder={hasKeyboard ? "Beruf und Ort, z. B. Informatiker Zürich  (Taste „/“)" : "Beruf und Ort, z. B. Informatiker Zürich"}
              className="min-h-14 min-w-0 flex-1 bg-transparent px-3 text-base font-medium text-[var(--ink)] !outline-none placeholder:font-normal placeholder:text-[var(--placeholder)]"
              onChange={(e) => { onQueryChange(e.target.value); setOpen(true); }}
              onFocus={() => setOpen(true)}
              onBlur={() => setTimeout(() => setOpen(false), 120)}
              onKeyDown={(e) => {
                if (e.key === "Escape") { if (open && suggestions.length) setOpen(false); else if (query) onQueryChange(""); return; }
                if (!open || !suggestions.length) return;
                if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => (i + 1) % suggestions.length); }
                else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => (i <= 0 ? suggestions.length - 1 : i - 1)); }
                else if (e.key === "Enter" && active >= 0) { e.preventDefault(); choose(suggestions[active].value); }
              }}
            />
            {query && <button type="button" aria-label="Suchfeld leeren" onClick={() => { onQueryChange(""); inputRef.current?.focus(); }} className="mr-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-[var(--hover)] hover:text-[var(--ink)]"><X size={18} strokeWidth={2.4} /></button>}
            </div>
            {open && suggestions.length > 0 && (
              <ul id={listId} role="listbox" aria-label={query.trim().length < 2 ? "Letzte Suchen" : "Vorschläge"} className="relative z-40 m-0 mt-2 max-h-72 list-none overflow-y-auto rounded-[var(--radius-lg)] border-[length:var(--border-w)] border-[var(--outline)] bg-[var(--surface)] p-1 shadow-[var(--shadow-md)] sm:absolute sm:inset-x-0 sm:top-full">
                {query.trim().length < 2 && <li role="presentation" className="flex items-center justify-between px-3 text-small font-semibold text-muted">Letzte Suchen<button type="button" onMouseDown={(e) => e.preventDefault()} onClick={onClearRecent} className="min-h-9 px-1 font-semibold underline decoration-2 underline-offset-4 hover:text-[var(--ink)] pointer-coarse:min-h-11">Löschen</button></li>}
                {suggestions.map((item, index) => (
                  <li key={item.value} id={`${listId}-${index}`} role="option" aria-selected={index === active} onMouseDown={(e) => e.preventDefault()} onClick={() => choose(item.value)} className={`flex min-h-11 cursor-pointer items-center gap-2.5 rounded-[var(--radius-md)] px-3 text-[15px] ${index === active ? "bg-[var(--sun)] font-semibold text-[var(--on-sun)]" : "hover:bg-[var(--surface-2)]"}`}>
                    {item.recent ? <History size={15} className="shrink-0 opacity-60" aria-hidden /> : <Search size={15} className="shrink-0 opacity-60" aria-hidden />}{item.value}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <Button type="submit" size="lg" loading={loading} icon={<Search size={17} />} className="sm:min-h-14 sm:px-7">{loading ? "Sucht …" : "Suchen"}</Button>
        </form>
        {hints.length > 0 && <p className="text-small text-muted">Wir suchen auch nach: {hints.join(", ")}</p>}
      </div>
    );
  },
);
