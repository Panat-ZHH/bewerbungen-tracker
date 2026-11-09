"use client";

import { forwardRef, useEffect, useId, useImperativeHandle, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { History, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fieldClasses } from "@/components/ui/input";
import { cn } from "@/lib/utils";
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
        <form role="search" onSubmit={(e) => { e.preventDefault(); setOpen(false); onSubmit(query); }} className="relative flex flex-col gap-2 sm:flex-row">
          <div className="relative min-w-0 flex-1">
            <Search size={17} aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 z-[1] -translate-y-1/2 text-muted" />
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
              className={cn(fieldClasses, "pl-10 pr-10 sm:text-base")}
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
            {query && <button type="button" aria-label="Suchfeld leeren" onClick={() => { onQueryChange(""); inputRef.current?.focus(); }} className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full text-muted hover:text-[var(--ink)]"><X size={16} /></button>}
            {open && suggestions.length > 0 && (
              <ul id={listId} role="listbox" aria-label={query.trim().length < 2 ? "Letzte Suchen" : "Vorschläge"} className="relative z-20 mt-1.5 overflow-hidden sm:absolute sm:inset-x-0 sm:top-full rounded-xl border border-[var(--glass-border)] bg-[var(--solid)] py-1 shadow-[var(--shadow-lg,0_12px_32px_rgba(0,0,0,.18))]">
                {query.trim().length < 2 && <li role="presentation" className="flex items-center justify-between px-3.5 py-1.5 text-xs font-semibold text-muted">Letzte Suchen<button type="button" onMouseDown={(e) => e.preventDefault()} onClick={onClearRecent} className="font-medium underline">Löschen</button></li>}
                {suggestions.map((item, index) => (
                  <li key={item.value} id={`${listId}-${index}`} role="option" aria-selected={index === active} onMouseDown={(e) => e.preventDefault()} onClick={() => choose(item.value)} className={`flex min-h-11 cursor-pointer items-center gap-2 px-3.5 text-sm ${index === active ? "bg-[var(--hover)]" : "hover:bg-[var(--hover)]"}`}>
                    {item.recent ? <History size={14} className="text-muted" aria-hidden /> : <Search size={14} className="text-muted" aria-hidden />}{item.value}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <Button type="submit" loading={loading} icon={<Search size={17} />} className="sm:min-h-11">{loading ? "Sucht …" : "Suchen"}</Button>
        </form>
        {hints.length > 0 && <p className="text-xs text-muted">Wir suchen auch nach: {hints.join(", ")}</p>}
      </div>
    );
  },
);
