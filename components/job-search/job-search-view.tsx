"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { LayoutList, Lightbulb, Plus, Rows3, SearchX, SlidersHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/input";
import { Skeleton, StatusMessage } from "@/components/ui/skeleton";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { reward } from "@/lib/rewards";
import { toast } from "@/lib/toast";
import { friendlyMessage, generalCause } from "@/lib/ux";
import { createApplication, getApplications } from "@/lib/storage";
import { supabase } from "@/lib/supabase";
import type { MultiSourceSearchBatch, MultiSourceSearchInput } from "@/lib/job-search";
import { listingSources, mergeJobResults } from "@/lib/job-results";
import { applicationExtras } from "@/lib/job-card-info";
import { FilterChips } from "./filter-chips";
import { FilterPanel } from "./filter-panel";
import { PresetMenu } from "./preset-menu";
import { ResultCard } from "./result-card";
import { SearchBar, useHasKeyboard, type SearchBarHandle, type SearchTab } from "./search-bar";
import { readPrefill } from "@/lib/onboarding";
import { activeFilterCount, addRecent, applyFilters, clearRecent, companyOptions, computeFacets, DEFAULT_RADIUS_KM, deletePreset, effectiveRadiusKm, emptyFilters, loadPresets, loadRecent, paramsToState, rankJobs, savePreset, sortJobs, SORT_LABELS, stateToParams, type EnrichedJob, type JobFilters, type JobPreset, type JobSearchState, type JobSort } from "./engine";

const PAGE_STEP = 20;
// a further page failed: a temporary hiccup, shown as a calm warning instead of a red error
const MORE_FAILED = "Weitere Stellen konnten gerade nicht geladen werden. Deine bisherigen Treffer bleiben da – tippe auf «Mehr laden», um es nochmals zu versuchen.";

function tabOf(f: JobFilters): SearchTab {
  return f.kind === "apprenticeship" ? "apprenticeship" : f.jobTypes.length === 1 && f.jobTypes[0] === "praktikum" ? "praktikum" : "job";
}
function serverQuery(state: JobSearchState): MultiSourceSearchInput {
  const praktikum = tabOf(state.filters) === "praktikum";
  const f = state.filters;
  // "Informatiker Zürich": the search API splits a place off the end of the text with the same resolver as the Ort filter
  // (lib/geo/places.ts) and reports it back as `place`; the browser does not carry the localities directory.
  const q = state.query.trim();
  const location = f.location.trim();
  const filters: NonNullable<MultiSourceSearchInput["filters"]> = {};
  if (f.postedWithin) filters.postedWithin = f.postedWithin;
  if (f.radiusKm !== undefined) filters.radiusKm = f.radiusKm; // 0 = "Nur dieser Ort"; only used when the search has a place
  if (f.cantons.length) filters.cantons = f.cantons;
  return { query: praktikum && !/praktik|stage/i.test(q) ? `Praktikum ${q}`.trim() : q, location, kind: f.kind, ...(Object.keys(filters).length ? { filters } : {}) };
}
/** True when the current server-side filters are wider than what was searched (so loaded results may miss listings). */
function serverWider(searched: MultiSourceSearchInput, current: MultiSourceSearchInput): boolean {
  const a = searched.filters ?? {}; const b = current.filters ?? {};
  if (a.postedWithin && (!b.postedWithin || b.postedWithin > a.postedWithin)) return true;
  if (current.location && (b.radiusKm ?? DEFAULT_RADIUS_KM) > (a.radiusKm ?? DEFAULT_RADIUS_KM)) return true;
  if (a.cantons?.length && (!b.cantons?.length || b.cantons.some((c) => !a.cantons!.includes(c)))) return true;
  return false;
}

export function JobSearchView() {
    const pathname = usePathname();
  const params = useSearchParams();
  const initial = useMemo(() => paramsToState(new URLSearchParams(params.toString())), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [state, setState] = useState<JobSearchState>(initial);
  const [results, setResults] = useState<EnrichedJob[]>([]);
  const [searched, setSearched] = useState<MultiSourceSearchInput | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<MultiSourceSearchBatch["nextCursor"]>(null);
  const [sourceStatuses, setSourceStatuses] = useState<MultiSourceSearchBatch["sources"]>([]);
  // the place the loaded results were searched for (resolved by the API) and how many listings had no recognisable place
  const [place, setPlace] = useState<MultiSourceSearchBatch["place"]>(null);
  const [hiddenNoPlace, setHiddenNoPlace] = useState(0);
  const lastPlace = useRef("");
  // Ort text the API did not know: changing or removing it searches again by itself
  const [unknownPlace, setUnknownPlace] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [softError, setSoftError] = useState<{ message: string; state: JobSearchState } | null>(null);
  const [compact, setCompact] = useState(false);
  const hasKeyboard = useHasKeyboard();
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState("");
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [sheetOpen, setSheetOpen] = useState(false);
  const [visible, setVisible] = useState(PAGE_STEP);
  const [recent, setRecent] = useState<string[]>([]);
  const [presets, setPresets] = useState<JobPreset[]>([]);
  const requestRef = useRef<AbortController | null>(null);
  const barRef = useRef<SearchBarHandle>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const lastUrl = useRef(params.toString());

  // localStorage is only readable after hydration
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setRecent(loadRecent()); setPresets(loadPresets()); try { setCompact(localStorage.getItem("wendapply-search-density") === "compact"); } catch { /* ignore */ } }, []);
  // Onboarding answers prefill an empty search (a search in the URL always wins).
  useEffect(() => {
    if (params.toString()) return;
    const prefill = readPrefill();
    if (!prefill) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState((s) => ({ ...s, query: prefill.query, filters: { ...s.filters, location: prefill.location, cantons: prefill.cantons, ...(prefill.startYear ? { startYear: prefill.startYear } : {}) } }));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- only on first mount
  useEffect(() => () => requestRef.current?.abort(), []);

  // URL sync (shareable): state -> URL
  useEffect(() => {
    const next = stateToParams(state).toString();
    // user ids never belong in a shareable URL: a stray ?uid=/?userId= is removed even if nothing else changed
    const stray = new URLSearchParams(window.location.search);
    const hadId = ["uid", "userId", "user_id", "user"].some((key) => stray.has(key));
    if (next === lastUrl.current && !hadId) return;
    lastUrl.current = next;
    // native History API: Next syncs it with useSearchParams, without a server round trip per keystroke/filter
    window.history.replaceState(window.history.state, "", next ? `${pathname}?${next}` : pathname);
  }, [state, pathname]);

  // keyboard: "/" focuses search
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (event.key === "/" && !event.metaKey && !event.ctrlKey && !(target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)))) { event.preventDefault(); barRef.current?.focus(); }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const patchFilters = useCallback((patch: Partial<JobFilters>) => setState((s) => ({ ...s, filters: { ...s.filters, ...patch } })), []);

  const runSearch = useCallback(async (next: JobSearchState) => {
    const input = serverQuery(next);
    if (input.query.length < 2) { setError("Bitte gib mindestens zwei Buchstaben ein."); return; }
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true); setLoadingMore(false); setError(""); setSoftError(null); setNotice(""); setNextCursor(null); setSourceStatuses([]); setResults([]); setSearched(null); setPlace(null); setHiddenNoPlace(0); setUnknownPlace(null); setVisible(PAGE_STEP);
    setRecent(addRecent(next.query));
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) throw new Error("Bitte melde dich erneut an.");
      const response = await fetch("/api/job-search", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` }, body: JSON.stringify(input), signal: controller.signal });
      const payload = await response.json();
      if (!response.ok) throw Object.assign(new Error(payload.error || "Die Suche hat nicht geklappt."), { code: payload.code });
      if (controller.signal.aborted) return;
      const found: MultiSourceSearchBatch["place"] = payload.place ?? null;
      const textCantons: string[] = payload.cantons ?? [];
      // A place or canton typed into the search text moves into the filters, so the radius control, chips and URL match what was searched.
      const moved = Boolean(found?.fromQuery) || textCantons.length > 0;
      const typedQuery = moved ? (input.query !== next.query.trim() ? String(payload.query).replace(/^Praktikum /, "") : String(payload.query)) : next.query;
      const cantons = [...new Set([...next.filters.cantons, ...textCantons])];
      const normalized: MultiSourceSearchInput = moved ? { ...input, query: payload.query, location: payload.location ?? "", ...(textCantons.length ? { filters: { ...input.filters, cantons } } : {}) } : input;
      const placeKey = found ? `${found.plz} ${found.name}` : "";
      const placeChanged = placeKey !== lastPlace.current;
      lastPlace.current = placeKey;
      setResults(payload.results); setNextCursor(payload.nextCursor); setSourceStatuses(payload.sources ?? []); setSearched(normalized); setPlace(found); setHiddenNoPlace(payload.hiddenWithoutPlace ?? 0);
      // with a place the nearest listings come first; without one the distance sort has nothing to sort by
      setState((s) => {
        const sort = found && placeChanged && s.sort === "relevance" ? "distance" : !found && s.sort === "distance" ? "relevance" : s.sort;
        if (!moved && sort === s.sort) return s;
        return { ...s, sort, ...(moved ? { query: typedQuery, filters: { ...s.filters, location: found?.fromQuery ? payload.location : s.filters.location, cantons } } : {}) };
      });
      if (payload.warning) setNotice(payload.warning);
      try {
        const applications = await getApplications();
        if (!controller.signal.aborted) setSaved(new Set(applications.map((a) => a.jobUrl).filter((u): u is string => Boolean(u))));
      } catch { if (!controller.signal.aborted) setNotice("Deine gemerkten Bewerbungen konnten nicht geprüft werden."); }
    } catch (cause) {
      if (!controller.signal.aborted) {
        const message = generalCause(cause) ?? (cause instanceof Error && cause.message ? cause.message : "");
        // an unknown place is a typing matter, not an outage: say exactly that
        if ((cause as { code?: string } | null)?.code === "unknown_place") { setError(message); setUnknownPlace(input.location); return; }
        // temporary problems on our or the job boards' side get a friendly message with a retry instead of a red error
        if (!message || /nicht|antwortet|später|Quelle|erreich/i.test(message) && !/anmelden|mindestens|Gib einen/i.test(message)) setSoftError({ message: "Die Stellenbörsen brauchen gerade etwas länger als sonst. Das ist meist nur kurz.", state: next });
        else setError(message);
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  // shared link with a query: run once on load
  const autoRan = useRef(false);
  useEffect(() => {
    if (autoRan.current) return;
    autoRan.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-off search for a shared link
    if (initial.query.trim().length >= 2) void runSearch(initial);
    // strict mode re-runs effects after aborting the first request: allow the second run to search again
    return () => { autoRan.current = false; };
  }, [initial, runSearch]);

  const loadMore = useCallback(async () => {
    if (!searched || !nextCursor || loading || loadingMore) return;
    const controller = new AbortController();
    requestRef.current?.abort();
    requestRef.current = controller;
    setLoadingMore(true); setError("");
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) throw new Error("Bitte melde dich erneut an.");
      const response = await fetch("/api/job-search", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` }, body: JSON.stringify({ ...searched, cursor: nextCursor, knownResults: results }), signal: controller.signal });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Weitere Stellen konnten nicht geladen werden.");
      if (controller.signal.aborted) return;
      setResults((current) => mergeJobResults(current, [...(payload.updates ?? []), ...payload.results]));
      setNextCursor(payload.nextCursor); setSourceStatuses(payload.sources ?? []); setHiddenNoPlace((count) => count + (payload.hiddenWithoutPlace ?? 0));
      setNotice(payload.warning ?? "");
    } catch (cause) {
      // the loaded results stay; the cursor is unchanged, so "Mehr laden" tries the same page again
      if (!controller.signal.aborted) setError(generalCause(cause) ?? MORE_FAILED);
    } finally {
      if (!controller.signal.aborted) setLoadingMore(false);
    }
  }, [searched, nextCursor, loading, loadingMore, results]);

  const filtered = useMemo(() => applyFilters(results, state.filters, saved), [results, state.filters, saved]);
  const ranked = useMemo(() => sortJobs(rankJobs(filtered, state.query), state.sort), [filtered, state.query, state.sort]);
  const facets = useMemo(() => computeFacets(results, state.filters, saved), [results, state.filters, saved]);
  const companies = useMemo(() => companyOptions(results), [results]);
  const shown = ranked.slice(0, visible);
  const hasMoreLocal = ranked.length > visible;

  // infinite scroll
  const more = useCallback((auto?: unknown) => { if (hasMoreLocal) setVisible((v) => v + PAGE_STEP); else if (auto !== true || !error) void loadMore(); }, [hasMoreLocal, loadMore, error]); // no automatic retry loop after a failed page; the "Mehr laden" button (called with the click event) always retries
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) more(true); }, { rootMargin: "400px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [more, shown.length, searched]);

  async function save(job: EnrichedJob) {
    const sources = listingSources(job);
    if (sources.some((s) => saved.has(s.url)) || saving) return;
    setSaving(job.url);
    try {
      const extras = applicationExtras(job);
      const notes = [extras.startNote, sources.length > 1 ? sources.map((s) => `${s.name}: ${s.url}`).join("\n") : undefined].filter(Boolean).join("\n") || undefined;
      await createApplication({ company: job.company || "Firma noch ergänzen", position: job.title, location: job.location, jobUrl: job.url, source: [...new Set(sources.map((s) => s.name))].join(", "), deadline: extras.deadline, jobDescription: extras.jobDescription, notes, category: "other", status: "saved" });
      setSaved((cur) => new Set([...cur, ...sources.map((s) => s.url)]));
      reward("saved");
      toast({ message: "Die Stelle steht jetzt unter „Bewerbungen“.", duration: 3500 });
    } catch (reason) {
      toast({ tone: "danger", message: friendlyMessage(reason, "Die Stelle konnte nicht gemerkt werden.") });
    } finally { setSaving(""); }
  }

  function onTab(tab: SearchTab) {
    setState((s) => ({ ...s, filters: { ...s.filters, kind: tab === "apprenticeship" ? "apprenticeship" : "job", jobTypes: tab === "praktikum" ? ["praktikum"] : s.filters.jobTypes.filter((t) => t !== "praktikum") } }));
  }
  const clearFilters = () => setState((s) => ({ ...s, filters: { ...emptyFilters(s.filters.kind), location: s.filters.location } }));
  const filterCount = activeFilterCount(state.filters);
  const canSavePreset = state.query.trim().length > 0 || filterCount > 0;
  const serverDirty = searched && (searched.location !== serverQuery(state).location || searched.kind !== state.filters.kind || serverWider(searched, serverQuery(state)));

  // Changing place, radius, canton, age or search type re-runs the search by itself (debounced), so the list always matches the filters.
  const rerunKey = serverDirty || (unknownPlace !== null && state.filters.location.trim() !== unknownPlace) ? JSON.stringify([state.filters.location.trim(), state.filters.kind, serverQuery(state).filters ?? null]) : "";
  useEffect(() => {
    if (!rerunKey || loading) return;
    const timer = setTimeout(() => void runSearch(state), 900);
    return () => clearTimeout(timer);
  }, [rerunKey]); // eslint-disable-line react-hooks/exhaustive-deps -- only the server-relevant key should restart the timer

  function toggleCompact(next: boolean) { setCompact(next); try { localStorage.setItem("wendapply-search-density", next ? "compact" : "comfortable"); } catch { /* ignore */ } }

  const panel = (prefix: string) => <FilterPanel idPrefix={prefix} filters={state.filters} onChange={patchFilters} facets={facets} companies={companies} />;

  return (
    <WorkspaceShell active="Suchen">
      <PageHeader title="Finde deine Stelle" description="Wir durchsuchen mehrere Stellenbörsen auf einmal." className="!mb-0" />

      <div className="mt-5 max-w-4xl">
        <SearchBar ref={barRef} query={state.query} onQueryChange={(query) => setState((s) => ({ ...s, query }))} onSubmit={(q) => void runSearch({ ...state, query: q })} tab={tabOf(state.filters)} onTabChange={onTab} recent={recent} onClearRecent={() => { clearRecent(); setRecent([]); }} loading={loading} />
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-[17rem_minmax(0,1fr)] lg:grid-cols-[19rem_minmax(0,1fr)]">
        <aside aria-label="Filter" className="hidden md:block">
          <Card className="sticky top-[84px] max-h-[calc(100dvh-110px)] overflow-y-auto p-5">
            <div className="mb-4 flex items-center justify-between"><h2 className="text-heading">Filter</h2>{filterCount > 0 && <button type="button" onClick={clearFilters} className="inline-flex min-h-9 items-center px-1 text-[13px] font-semibold text-muted underline decoration-[var(--line)] decoration-2 underline-offset-4 hover:text-[var(--ink)] hover:decoration-[var(--ink)]">Zurücksetzen</button>}</div>
            {panel("d")}
          </Card>
        </aside>

        <section aria-label="Suchergebnisse" className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="secondary" size="sm" className="md:hidden" icon={<SlidersHorizontal size={15} />} onClick={() => setSheetOpen(true)}>Filter{filterCount > 0 ? ` (${filterCount})` : ""}</Button>
            <PresetMenu presets={presets} canSave={canSavePreset} onSave={(name) => { setPresets(savePreset(name, state)); toast({ message: "Suche gespeichert." }); }} onApply={(p) => { setState(p.state); void runSearch(p.state); }} onDelete={(id) => setPresets(deletePreset(id))} />
            <div className="ml-auto flex items-center gap-2"><div role="group" aria-label="Darstellung" className="flex gap-0.5 rounded-full border-[length:var(--border-w)] border-[var(--outline)] bg-[var(--surface)] p-0.5"><button type="button" aria-pressed={!compact} aria-label="Ausführliche Liste" onClick={() => toggleCompact(false)} className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors duration-150 pointer-coarse:h-10 pointer-coarse:w-10 ${!compact ? "bg-[var(--ink)] text-[var(--paper)]" : "text-muted hover:bg-[var(--hover)] hover:text-[var(--ink)]"}`}><LayoutList size={16} /></button><button type="button" aria-pressed={compact} aria-label="Kompakte Liste" onClick={() => toggleCompact(true)} className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors duration-150 pointer-coarse:h-10 pointer-coarse:w-10 ${compact ? "bg-[var(--ink)] text-[var(--paper)]" : "text-muted hover:bg-[var(--hover)] hover:text-[var(--ink)]"}`}><Rows3 size={16} /></button></div><label htmlFor="job-sort" className="text-small font-semibold text-muted max-sm:sr-only">Sortieren</label><Select id="job-sort" className="!min-h-9 !w-auto !rounded-full !py-1 !font-semibold pointer-coarse:!min-h-11" value={state.sort} onChange={(e) => setState((s) => ({ ...s, sort: e.target.value as JobSort }))}>{Object.entries(SORT_LABELS).filter(([v]) => v !== "distance" || place || state.filters.location.trim() || state.sort === "distance").map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></div>
          </div>

          <div className="mt-3"><FilterChips filters={state.filters} onChange={patchFilters} onClear={clearFilters} /></div>

          {error && <StatusMessage tone={error === MORE_FAILED ? "warning" : "danger"} className="mt-4">{error}</StatusMessage>}
          {notice && <StatusMessage tone="info" className="mt-4">{notice}</StatusMessage>}
          {softError && !loading && <StatusMessage tone="info" className="mt-4">{softError.message} <button type="button" className="font-semibold underline" onClick={() => void runSearch(softError.state)}>Nochmals versuchen</button></StatusMessage>}
          {serverDirty && !loading && !softError && <StatusMessage tone="info" className="mt-4">Du hast Ort, Umkreis oder Alter geändert – die Liste wird gleich neu gesucht. <button type="button" className="font-semibold underline" onClick={() => void runSearch(state)}>Neu suchen mit Filtern</button></StatusMessage>}

          {loading && <div role="status" aria-live="polite" className="mt-5 space-y-3"><p className="text-body text-muted">Passende Anzeigen werden gesucht …</p>{[0, 1, 2, 3].map((i) => <Card key={i} className="space-y-3 p-5 !shadow-none" aria-hidden><Skeleton className="h-5 w-2/3" /><Skeleton className="h-4 w-1/3" /><Skeleton className="h-4 w-1/2" /></Card>)}</div>}

          {!searched && !loading && !error && (
            <Card className="mt-5 max-w-2xl !border-dashed !bg-transparent p-5 text-[15px] text-muted !shadow-none"><p className="text-heading text-[var(--ink)]">So geht die Suche</p><ul className="mt-3 list-disc space-y-1.5 pl-5 marker:text-[var(--ink)]"><li>Wähle Lehrstelle, Praktikum oder Job und tippe einen Beruf ein – gern mit Ort, z. B. „Informatiker Zürich“.</li><li>Mit den Filtern grenzt du Ort, Kanton, Pensum, Berufsfeld und mehr ein – ohne neu zu laden.</li>{hasKeyboard && <li>Drücke „/“, um schnell ins Suchfeld zu springen.</li>}</ul></Card>
          )}

          {searched && !loading && (
            <div className="mt-4">
              <p className="text-body text-muted" aria-live="polite"><strong className="marker font-display text-xl font-extrabold text-[var(--ink)] tabular">{ranked.length}</strong> {ranked.length === 1 ? "Treffer" : "Treffer"}{filtered.length !== results.length ? ` (von ${results.length} geladenen)` : ""} für „{searched.query}“{place ? ` in ${place.label} (${effectiveRadiusKm(state.filters) === 0 ? "nur dieser Ort" : `bis ${effectiveRadiusKm(state.filters)} km`})` : " · ganze Schweiz"}{place && hiddenNoPlace > 0 ? ` · ${hiddenNoPlace} ${hiddenNoPlace === 1 ? "Anzeige" : "Anzeigen"} ohne erkennbaren Ort ausgeblendet` : ""}</p>
              {sourceStatuses.length > 0 && <ul aria-label="Durchsuchte Quellen" className="mt-2 flex flex-wrap gap-2">{sourceStatuses.map((s) => <li key={s.name}><Badge tone="neutral">{s.name}{s.status === "unavailable" ? " · antwortet gerade nicht" : ` · ${facets.sources[s.name] ?? 0}${s.status === "partial" ? " · noch nicht alle geladen" : ""}`}</Badge></li>)}</ul>}

              {ranked.length === 0 ? (
                <Card className="mt-5 flex flex-col items-center !border-dashed !bg-transparent px-6 py-10 text-center !shadow-none">
                  <SearchX size={28} className="text-[var(--ink)]" aria-hidden />
                  <p className="mt-3 text-heading">Keine passenden Anzeigen gefunden</p>
                  <p className="mt-1.5 max-w-md text-body text-muted">{results.length > 0 ? "Deine Filter sind für diese Treffer zu streng." : "Versuche einen verwandten Beruf oder einen anderen Ort."}</p>
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    {filterCount > 0 && <Button type="button" variant="secondary" icon={<Lightbulb size={15} />} onClick={clearFilters}>Suche erweitern: Filter löschen</Button>}
                    {state.filters.location && <Button type="button" variant="secondary" onClick={() => { const next = { ...state, filters: { ...state.filters, location: "", radiusKm: undefined } }; setState(next); void runSearch(next); }}>In der ganzen Schweiz suchen</Button>}
                  </div>
                </Card>
              ) : (
                <ol className={`mt-4 grid ${compact ? "gap-2" : "gap-3"}`}>
                  {shown.map((item) => (
                    <li key={item.job.url}><ResultCard compact={compact} item={item} placeLabel={place?.label} saved={listingSources(item.job).some((s) => saved.has(s.url))} saving={saving === item.job.url} onSave={() => void save(item.job)} /></li>
                  ))}
                </ol>
              )}

              <div ref={sentinelRef} className="mt-6 flex min-h-11 flex-col items-start gap-2">
                {loadingMore && <div role="status" className="w-full space-y-3"><Card className="space-y-3 p-5 !shadow-none" aria-hidden><Skeleton className="h-5 w-2/3" /><Skeleton className="h-4 w-1/3" /></Card></div>}
                {(hasMoreLocal || nextCursor) && !loadingMore && <Button type="button" variant="secondary" className="w-full sm:w-auto" onClick={more} icon={<Plus size={16} />}>Mehr laden</Button>}
                {!hasMoreLocal && !nextCursor && ranked.length > 0 && <p className="text-sm text-muted">Alle passenden Stellen der durchsuchten Quellen sind angezeigt.</p>}
              </div>
            </div>
          )}
        </section>
      </div>

      <Modal open={sheetOpen} onClose={() => setSheetOpen(false)} title="Filter" footer={<div className="flex w-full gap-2"><Button type="button" variant="ghost" onClick={clearFilters}>Zurücksetzen</Button><Button type="button" className="flex-1" onClick={() => setSheetOpen(false)}>Fertig</Button></div>}>
        {sheetOpen && panel("m")}
      </Modal>
    </WorkspaceShell>
  );
}
