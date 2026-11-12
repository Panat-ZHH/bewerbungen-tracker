"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Input } from "@/components/ui/input";

export interface PlaceOption { name: string; plz: string; canton: string; label: string; value: string }

async function fetchPlaces(query: string, signal: AbortSignal): Promise<PlaceOption[]> {
  const response = await fetch(`/api/places?q=${encodeURIComponent(query)}`, { signal });
  if (!response.ok) return [];
  const payload = await response.json();
  return Array.isArray(payload.places) ? payload.places : [];
}

/**
 * Ort field with suggestions "Ortschaft · PLZ · Kanton" (accessible combobox: arrow keys, Enter, Escape; works by tap).
 * The typed text is only handed to `onChange` when it is committed (suggestion chosen, Enter, leaving the field, or emptied),
 * so the search does not restart on every keystroke. Suggestions come from /api/places – the directory stays on the server.
 * Look: Agent A, see HANDOFF.md – classes `location-autocomplete…`.
 */
export function LocationAutocomplete({ id, value, onChange, label = "Ort", placeholder = "Ort oder PLZ", maxLength = 80, loadPlaces = fetchPlaces }: {
  id: string; value: string; onChange: (value: string) => void; label?: string; placeholder?: string; maxLength?: number;
  loadPlaces?: (query: string, signal: AbortSignal) => Promise<PlaceOption[]>;
}) {
  const [draft, setDraft] = useState(value);
  const [committed, setCommitted] = useState(value);
  const [options, setOptions] = useState<PlaceOption[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const request = useRef<AbortController | null>(null);
  const listId = `${id}-list`;

  // the value changed outside (chip removed, place taken from the search text): show it
  if (value !== committed) { setCommitted(value); setDraft(value); }

  const stop = () => { if (timer.current) clearTimeout(timer.current); request.current?.abort(); };
  useEffect(() => stop, []);

  function close() { stop(); setOpen(false); setActive(-1); setLoading(false); }
  function commit(next: string) {
    const text = next.trim();
    close();
    setDraft(text);
    if (text !== value) { setCommitted(text); onChange(text); }
  }
  function type(next: string) {
    setDraft(next);
    stop();
    if (!next.trim()) { setOptions([]); commit(""); return; }
    if (next.trim().length < 2) { setOptions([]); setOpen(false); return; }
    setLoading(true);
    timer.current = setTimeout(async () => {
      const controller = new AbortController();
      request.current = controller;
      try {
        const places = await loadPlaces(next.trim(), controller.signal);
        if (controller.signal.aborted) return;
        setOptions(places); setOpen(true); setActive(-1);
      } catch { if (!controller.signal.aborted) setOptions([]); } finally { if (!controller.signal.aborted) setLoading(false); }
    }, 150);
  }
  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (!options.length) return;
      event.preventDefault();
      setOpen(true);
      setActive((current) => (event.key === "ArrowDown" ? (current + 1) % options.length : (current <= 0 ? options.length : current) - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      commit(open && active >= 0 && options[active] ? options[active].value : draft);
    } else if (event.key === "Escape" && open) {
      // only the suggestions close; a surrounding dialog (the filter sheet on phones) stays open
      event.preventDefault();
      event.stopPropagation();
      event.nativeEvent.stopImmediatePropagation();
      close();
    }
  }

  const expanded = open && options.length > 0;
  return (
    <div className="location-autocomplete" data-open={expanded || undefined} data-loading={loading || undefined}>
      <Input
        id={id} type="text" role="combobox" aria-label={label} aria-autocomplete="list" aria-expanded={expanded} aria-controls={listId}
        aria-activedescendant={expanded && active >= 0 ? `${id}-option-${active}` : undefined}
        className="location-autocomplete__input" autoComplete="off" autoCapitalize="words" spellCheck={false} enterKeyHint="search" maxLength={maxLength}
        value={draft} placeholder={placeholder} onChange={(event) => type(event.target.value)} onKeyDown={onKeyDown} onBlur={() => commit(draft)}
        onFocus={() => { if (options.length && draft.trim().length >= 2 && draft !== value) setOpen(true); }}
      />
      <ul id={listId} role="listbox" aria-label="Vorschläge für den Ort" className="location-autocomplete__list" hidden={!expanded}>
        {options.map((option, index) => (
          <li
            key={`${option.plz}-${option.name}`} id={`${id}-option-${index}`} role="option" aria-selected={index === active} data-active={index === active || undefined}
            className="location-autocomplete__option" onMouseDown={(event) => event.preventDefault()} onMouseEnter={() => setActive(index)} onClick={() => commit(option.value)}
          >
            <span className="location-autocomplete__name">{option.name}</span>{" "}
            <span className="location-autocomplete__meta">{option.plz} · {option.canton}</span>
          </li>
        ))}
      </ul>
      <div className="location-autocomplete__status sr-only" role="status" aria-live="polite">
        {loading ? "Vorschläge werden geladen …" : open ? (options.length ? `${options.length} ${options.length === 1 ? "Vorschlag" : "Vorschläge"}. Mit den Pfeiltasten auswählen.` : "Kein passender Ort gefunden. Du kannst auch eine Postleitzahl eingeben.") : ""}
      </div>
    </div>
  );
}
