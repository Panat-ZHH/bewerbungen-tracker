"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Lightbulb, Plus, SearchX, SlidersHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/input";
import { Skeleton, StatusMessage } from "@/components/ui/skeleton";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { toast } from "@/lib/toast";
import { friendlyMessage, generalCause } from "@/lib/ux";
import { createApplication, getApplications } from "@/lib/storage";
import { supabase } from "@/lib/supabase";
import type { MultiSourceSearchBatch, MultiSourceSearchInput } from "@/lib/job-search";
import { listingSources, mergeJobResults } from "@/lib/job-results";
import { FilterChips } from "./filter-chips";
import { FilterPanel } from "./filter-panel";
import { PresetMenu } from "./preset-menu";
import { ResultCard } from "./result-card";
import { SearchBar, type SearchBarHandle, type SearchTab } from "./search-bar";
import { readPrefill } from "@/lib/onboarding";
import { activeFilterCount, addRecent, applyFilters, clearRecent, companyOptions, computeFacets, deletePreset, emptyFilters, loadPresets, loadRecent, paramsToState, rankJobs, savePreset, sortJobs, SORT_LABELS, stateToParams, type EnrichedJob, type JobFilters, type JobPreset, type JobSearchState, type JobSort } from "./engine";

const PAGE_STEP = 20;

function tabOf(f: JobFilters): SearchTab {
  return f.kind === "apprenticeship" ? "apprenticeship" : f.jobTypes.length === 1 && f.jobTypes[0] === "praktikum" ? "praktikum" : "job";
}
function serverQuery(state: JobSearchState): MultiSourceSearchInput {
  const praktikum = tabOf(state.filters) === "praktikum";
  const q = state.query.trim();
  const f = state.filters;
  const filters: NonNullable<MultiSourceSearchInput["filters"]> = {};
  if (f.postedWithin) filters.postedWithin = f.postedWithin;
  if (f.radiusKm && f.location.trim()) filters.radiusKm = f.radiusKm;
  if (f.cantons.length) filters.cantons = f.cantons;
  return { query: praktikum && !/praktik|stage/i.test(q) ? `Praktikum ${q}`.trim() : q, location: f.location.trim(), kind: f.kind, ...(Object.keys(filters).length ? { filters } : {}) };
}
/** True when the current server-side filters are wider than what was searched (so loaded results may miss listings). */
function serverWider(searched: MultiSourceSearchInput, current: MultiSourceSearchInput): boolean {
  const a = searched.filters ?? {}; const b = current.filters ?? {};
  if (a.postedWithin && (!b.postedWithin || b.postedWithin > a.postedWithin)) return true;
  if (a.radiusKm && (!b.radiusKm || b.radiusKm > a.radiusKm)) return true;
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
  const [error, setError] = useState("");
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
  useEffect(() => { setRecent(loadRecent()); setPresets(loadPresets()); }, []);
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
    if (next === lastUrl.current) return;
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
    setLoading(true); setLoadingMore(false); setError(""); setNotice(""); setNextCursor(null); setSourceStatuses([]); setResults([]); setSearched(null); setVisible(PAGE_STEP);
    setRecent(addRecent(next.query));
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) throw new Error("Bitte melde dich erneut an.");
      const response = await fetch("/api/job-search", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` }, body: JSON.stringify(input), signal: controller.signal });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Die Suche hat nicht geklappt.");
      if (controller.signal.aborted) return;
      setResults(payload.results); setNextCursor(payload.nextCursor); setSourceStatuses(payload.sources ?? []); setSearched(input);
      if (payload.warning) setNotice(payload.warning);
      try {
        const applications = await getApplications();
        if (!controller.signal.aborted) setSaved(new Set(applications.map((a) => a.jobUrl).filter((u): u is string => Boolean(u))));
      } catch { if (!controller.signal.aborted) setNotice("Deine gemerkten Bewerbungen konnten nicht geprüft werden."); }
    } catch (cause) {
      if (!controller.signal.aborted) setError(generalCause(cause) ?? (cause instanceof Error && cause.message ? cause.message : "Die Suche hat nicht geklappt."));
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
      setNextCursor(payload.nextCursor); setSourceStatuses(payload.sources ?? []);
      if (payload.warning) setNotice(payload.warning);
    } catch (cause) {
      if (!controller.signal.aborted) setError(generalCause(cause) ?? (cause instanceof Error && cause.message ? cause.message : "Weitere Stellen konnten nicht geladen werden."));
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
  const more = useCallback(() => { if (hasMoreLocal) setVisible((v) => v + PAGE_STEP); else void loadMore(); }, [hasMoreLocal, loadMore]);
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) more(); }, { rootMargin: "400px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [more, shown.length, searched]);

  async function save(job: EnrichedJob) {
    const sources = listingSources(job);
    if (sources.some((s) => saved.has(s.url)) || saving) return;
    setSaving(job.url);
    try {
      await createApplication({ company: job.company || "Firma noch ergänzen", position: job.title, location: job.location, jobUrl: job.url, source: [...new Set(sources.map((s) => s.name))].join(", "), notes: sources.length > 1 ? sources.map((s) => `${s.name}: ${s.url}`).join("\n") : undefined, category: "other", status: "saved" });
      setSaved((cur) => new Set([...cur, ...sources.map((s) => s.url)]));
      toast({ message: "Gemerkt – die Stelle steht jetzt unter „Bewerbungen“." });
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
  const serverDirty = searched && (searched.location !== state.filters.location.trim() || searched.kind !== state.filters.kind || serverWider(searched, serverQuery(state)));

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
            <div className="mb-4 flex items-center justify-between"><h2 className="text-heading">Filter</h2>{filterCount > 0 && <button type="button" onClick={clearFilters} className="inline-flex min-h-9 items-center px-1 text-[13px] font-semibold text-muted hover:text-[var(--ink)] hover:underline">Zurücksetzen</button>}</div>
            {panel("d")}
          </Card>
        </aside>

        <section aria-label="Suchergebnisse" className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="secondary" size="sm" className="md:hidden" icon={<SlidersHorizontal size={15} />} onClick={() => setSheetOpen(true)}>Filter{filterCount > 0 ? ` (${filterCount})` : ""}</Button>
            <PresetMenu presets={presets} canSave={canSavePreset} onSave={(name) => { setPresets(savePreset(name, state)); toast({ message: "Suche gespeichert." }); }} onApply={(p) => { setState(p.state); void runSearch(p.state); }} onDelete={(id) => setPresets(deletePreset(id))} />
            <div className="ml-auto flex items-center gap-2"><label htmlFor="job-sort" className="text-xs text-muted">Sortieren</label><Select id="job-sort" className="!min-h-9 !w-auto" value={state.sort} onChange={(e) => setState((s) => ({ ...s, sort: e.target.value as JobSort }))}>{Object.entries(SORT_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></div>
          </div>

          <div className="mt-3"><FilterChips filters={state.filters} onChange={patchFilters} onClear={clearFilters} /></div>

          {error && <StatusMessage tone="danger" className="mt-4">{error}</StatusMessage>}
          {notice && <StatusMessage tone="info" className="mt-4">{notice}</StatusMessage>}
          {serverDirty && !loading && <StatusMessage tone="info" className="mt-4">Suchbereich wurde geändert. <button type="button" className="font-semibold underline" onClick={() => void runSearch(state)}>Jetzt neu suchen</button></StatusMessage>}

          {loading && <div role="status" aria-live="polite" className="mt-5 space-y-3"><p className="text-body text-muted">Passende Anzeigen werden gesucht …</p>{[0, 1, 2, 3].map((i) => <Card key={i} className="space-y-3 p-5" aria-hidden><Skeleton className="h-5 w-2/3" /><Skeleton className="h-4 w-1/3" /><Skeleton className="h-4 w-1/2" /></Card>)}</div>}

          {!searched && !loading && !error && (
            <Card className="mt-5 border-dashed p-5 text-sm text-muted"><p className="font-semibold text-[var(--ink)]">So geht die Suche</p><ul className="mt-2 list-disc space-y-1 pl-5"><li>Wähle Lehrstelle, Praktikum oder Job und tippe einen Beruf ein.</li><li>Mit den Filtern grenzt du Ort, Kanton, Pensum, Berufsfeld und mehr ein – ohne neu zu laden.</li><li>Drücke „/“, um schnell ins Suchfeld zu springen.</li></ul></Card>
          )}

          {searched && !loading && (
            <div className="mt-4">
              <p className="text-small text-muted" aria-live="polite"><strong className="text-[var(--ink)]">{ranked.length}</strong> {ranked.length === 1 ? "Treffer" : "Treffer"}{filtered.length !== results.length ? ` (von ${results.length} geladenen)` : ""} für „{searched.query}“{searched.location ? ` in ${searched.location}` : " · ganze Schweiz"}</p>
              {sourceStatuses.length > 0 && <ul aria-label="Durchsuchte Quellen" className="mt-2 flex flex-wrap gap-2">{sourceStatuses.map((s) => <li key={s.name}><Badge tone={s.status === "unavailable" ? "danger" : "neutral"}>{s.name}{s.status === "unavailable" ? " · gerade nicht erreichbar" : ` · ${facets.sources[s.name] ?? 0}`}</Badge></li>)}</ul>}

              {ranked.length === 0 ? (
                <Card className="mt-5 flex flex-col items-center px-6 py-10 text-center">
                  <SearchX size={28} className="text-muted" aria-hidden />
                  <p className="mt-3 font-semibold">Keine passenden Anzeigen gefunden</p>
                  <p className="mt-1 max-w-md text-sm text-muted">{results.length > 0 ? "Deine Filter sind für diese Treffer zu streng." : "Versuche einen verwandten Beruf oder einen anderen Ort."}</p>
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    {filterCount > 0 && <Button type="button" variant="secondary" icon={<Lightbulb size={15} />} onClick={clearFilters}>Suche erweitern: Filter löschen</Button>}
                    {state.filters.location && <Button type="button" variant="secondary" onClick={() => { const next = { ...state, filters: { ...state.filters, location: "", radiusKm: undefined } }; setState(next); void runSearch(next); }}>In der ganzen Schweiz suchen</Button>}
                  </div>
                </Card>
              ) : (
                <ol className="mt-4 grid gap-3">
                  {shown.map((item) => (
                    <li key={item.job.url}><ResultCard item={item} saved={listingSources(item.job).some((s) => saved.has(s.url))} saving={saving === item.job.url} onSave={() => void save(item.job)} /></li>
                  ))}
                </ol>
              )}

              <div ref={sentinelRef} className="mt-6 flex min-h-11 flex-col items-start gap-2">
                {loadingMore && <div role="status" className="w-full space-y-3"><Card className="space-y-3 p-5" aria-hidden><Skeleton className="h-5 w-2/3" /><Skeleton className="h-4 w-1/3" /></Card></div>}
                {(hasMoreLocal || nextCursor) && !loadingMore && <Button type="button" variant="secondary" className="w-full sm:w-auto" onClick={more} icon={<Plus size={16} />}>Mehr laden</Button>}
                {!hasMoreLocal && !nextCursor && ranked.length > 0 && <p className="text-sm text-muted">Alle passenden Stellen der durchsuchten Quellen sind angezeigt.</p>}
              </div>
            </div>
          )}
        </section>
      </div>

      <Modal open={sheetOpen} onClose={() => setSheetOpen(false)} title="Filter" footer={<div className="flex w-full gap-2"><Button type="button" variant="ghost" onClick={clearFilters}>Zurücksetzen</Button><Button type="button" className="flex-1" onClick={() => setSheetOpen(false)}>{ranked.length} Treffer anzeigen</Button></div>}>
        {sheetOpen && panel("m")}
      </Modal>
    </WorkspaceShell>
  );
}
