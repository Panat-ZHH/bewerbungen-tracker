"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, ExternalLink, MapPin, Plus, Search, SearchX, SlidersHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { WorkspaceShell } from "@/components/layout/workspace-shell";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { createApplication, getApplications } from "@/lib/storage";
import { supabase } from "@/lib/supabase";
import type { MultiSourceSearchBatch, MultiSourceSearchInput, JobSearchResult, SearchKind } from "@/lib/job-search";
import { listingSources, mergeJobResults } from "@/lib/job-results";

export default function JobSearchPage() {
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("");
  const [kind, setKind] = useState<SearchKind>("apprenticeship");
  const [results, setResults] = useState<JobSearchResult[]>([]);
  const [searched, setSearched] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [activeSearch, setActiveSearch] = useState<MultiSourceSearchInput | null>(null);
  const [nextCursor, setNextCursor] = useState<MultiSourceSearchBatch["nextCursor"]>(null);
  const [sourceStatuses, setSourceStatuses] = useState<MultiSourceSearchBatch["sources"]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState("");
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [filtersOpen, setFiltersOpen] = useState(true);
  const requestRef = useRef<AbortController | null>(null);

  useEffect(() => () => requestRef.current?.abort(), []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true);
    setLoadingMore(false);
    setActiveSearch(null);
    setNextCursor(null);
    setSourceStatuses([]);
    setError("");
    setNotice("");
    setResults([]);
    setSearched("");
    setFiltersOpen(false);
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) throw new Error("Bitte melde dich erneut an.");
      const response = await fetch("/api/job-search", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` },
        body: JSON.stringify({ query, location, kind }),
        signal: controller.signal,
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Die Suche hat nicht geklappt.");
      if (controller.signal.aborted) return;
      setResults(payload.results);
      setNextCursor(payload.nextCursor);
      setSourceStatuses(payload.sources ?? []);
      setActiveSearch({ query: query.trim(), location: location.trim(), kind });
      if (payload.warning) setNotice(payload.warning);
      setSearched(`${kind === "apprenticeship" ? "Lehrstellen" : "Jobs"}: ${query.trim()}${location.trim() ? ` · ${location.trim()}` : " · ganze Schweiz"}`);
      try {
        const applications = await getApplications();
        if (!controller.signal.aborted) setSaved(new Set(applications.map((item) => item.jobUrl).filter((url): url is string => Boolean(url))));
      } catch {
        if (!controller.signal.aborted) setNotice("Deine gemerkten Bewerbungen konnten nicht geprüft werden.");
      }
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Die Suche hat nicht geklappt.");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  async function loadMore() {
    if (!activeSearch || !nextCursor || loading || loadingMore) return;
    const controller = new AbortController();
    requestRef.current?.abort();
    requestRef.current = controller;
    setLoadingMore(true);
    setError("");
    setNotice("");
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) throw new Error("Bitte melde dich erneut an.");
      const response = await fetch("/api/job-search", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` },
        body: JSON.stringify({ ...activeSearch, cursor: nextCursor, knownResults: results }),
        signal: controller.signal,
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Weitere Stellen konnten nicht geladen werden.");
      if (controller.signal.aborted) return;
      setResults((current) => mergeJobResults(current, [...(payload.updates ?? []), ...payload.results]));
      setNextCursor(payload.nextCursor);
      setSourceStatuses(payload.sources ?? []);
      if (payload.warning) setNotice(payload.warning);
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Weitere Stellen konnten nicht geladen werden.");
    } finally {
      if (!controller.signal.aborted) setLoadingMore(false);
    }
  }

  async function save(result: JobSearchResult) {
    const sources = listingSources(result);
    if (sources.some((source) => saved.has(source.url)) || saving) return;
    setSaving(result.url);
    setNotice("");
    try {
      await createApplication({ company: result.company || "Firma noch ergänzen", position: result.title, location: result.location, jobUrl: result.url, source: [...new Set(sources.map((source) => source.name))].join(", "), notes: sources.length > 1 ? sources.map((source) => `${source.name}: ${source.url}`).join("\n") : undefined, category: "other", status: "saved" });
      setSaved((current) => new Set([...current, ...sources.map((source) => source.url)]));
      setNotice("Die Stelle ist jetzt bei deinen Bewerbungen.");
    } catch {
      setNotice("Die Stelle konnte nicht gemerkt werden. Versuch es noch einmal.");
    } finally {
      setSaving("");
    }
  }

  return (
    <WorkspaceShell active="Suchen">
      <div>
        <h1 className="text-3xl font-semibold tracking-[-1px] md:text-[38px]">Finde deine Stelle</h1>
        <p className="mt-2 text-base text-muted">Wir durchsuchen mehrere Stellenbörsen auf einmal.</p>
      </div>

      <div className="glass-bar sticky top-[68px] z-10 -mx-3.5 mt-5 rounded-xl border px-3.5 py-2 md:hidden">
        <button type="button" aria-expanded={filtersOpen} aria-controls="search-filters" onClick={() => setFiltersOpen((open) => !open)} className="flex min-h-11 w-full items-center justify-between gap-3 text-left text-sm font-medium">
          <span className="flex min-w-0 items-center gap-2"><SlidersHorizontal size={16} className="shrink-0 text-[#0866d6]" /><span className="truncate">{searched || "Suche anpassen"}</span></span>
          <ChevronDown size={18} className={`shrink-0 text-[#6e6e73] transition-transform duration-200 ${filtersOpen ? "rotate-180" : ""}`} />
        </button>
      </div>

      <form id="search-filters" onSubmit={submit} className={`${filtersOpen ? "block" : "hidden"} mt-5 max-w-3xl space-y-5 md:mt-7 md:block`}>
        <Card className="space-y-5 p-5 md:p-6">
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Was suchst du?</legend>
            <div className="inline-flex gap-1 rounded-full border border-white/80 bg-white/50 p-1">
              {([{ value: "apprenticeship", label: "Lehrstelle" }, { value: "job", label: "Job" }] as const).map((option) => (
                <label key={option.value} className={`flex min-h-10 cursor-pointer items-center rounded-full px-5 text-sm font-medium transition has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[#0866d6] ${kind === option.value ? "bg-white text-[#075dbd] shadow-sm" : "text-[#5e5e63] hover:text-[#1d1d1f]"}`}>
                  <input type="radio" name="kind" value={option.value} checked={kind === option.value} onChange={() => setKind(option.value)} className="sr-only" />
                  {option.label}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid gap-4 sm:grid-cols-[1.3fr_1fr]">
            <label><span className="mb-2 block text-sm font-medium">Beruf oder Stelle</span><Input required minLength={2} maxLength={80} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Zum Beispiel: Informatiker" /></label>
            <label><span className="mb-2 block text-sm font-medium">Ort <span className="text-muted">(optional)</span></span><Input maxLength={80} value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Zum Beispiel: Zürich" /></label>
          </div>
          <Button type="submit" disabled={loading} className="min-h-11 w-full sm:w-auto"><Search size={17} />{loading ? "Sucht …" : "Stellen suchen"}</Button>
        </Card>
      </form>

      {error && <p role="alert" className="mt-6 max-w-3xl rounded-xl border border-[#e8c7c7] bg-[#fff8f8] px-4 py-3 text-sm text-[#a32828]">{error}</p>}
      {notice && <p role="status" className="glass-surface mt-5 max-w-3xl px-4 py-3 text-sm">{notice}</p>}
      {loading && <div role="status" className="mt-8 space-y-3"><p className="text-sm text-muted">Passende Anzeigen werden gesucht …</p>{[0, 1, 2].map((item) => <div key={item} className="h-32 animate-pulse rounded-[14px] bg-white/60" />)}</div>}
      {searched && <section className="mt-8 md:mt-9">
        <h2 className="text-lg font-semibold break-words">{searched}</h2>
        <p className="mt-1 text-sm text-muted" aria-live="polite">{results.length} Treffer</p>
        {sourceStatuses.length > 0 && <ul aria-label="Durchsuchte Quellen" className="mt-3 flex flex-wrap gap-2">
          {sourceStatuses.map((source) => <li key={source.name}><Badge className={source.status === "unavailable" ? "bg-[#fff0f0] text-[#a32828]" : ""}>{source.name}{source.status === "unavailable" ? " · gerade nicht erreichbar" : " · durchsucht"}</Badge></li>)}
        </ul>}
        {!results.length ? <Card className="mt-5 flex flex-col items-center px-6 py-10 text-center"><SearchX size={28} className="text-[#737378]" /><p className="mt-3 font-semibold">Keine passenden Anzeigen gefunden</p><p className="mt-1 text-sm text-muted">Probiere einen anderen Beruf oder Ort.</p><Button type="button" variant="secondary" className="mt-4 min-h-11" onClick={() => setFiltersOpen(true)}>Suche anpassen</Button></Card> : <div className="mt-4 grid gap-3">
          {results.map((result) => {
            const sources = listingSources(result);
            const isSaved = sources.some((source) => saved.has(source.url));
            return <Card key={result.url} className="transition duration-200 hover:-translate-y-0.5"><article className="flex flex-col gap-4 p-5 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <h3 className="break-words text-base font-semibold">{result.title}</h3>
              {result.company && <p className="mt-1 break-words text-sm">{result.company}</p>}
              <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">{result.location && <Badge><MapPin size={12} className="mr-1" />{result.location}</Badge>}<Badge>{sources.length > 1 ? `${sources.length} Quellen` : result.source}</Badge></p>
              <ul aria-label="Originalanzeigen" className="mt-1 flex flex-wrap gap-x-4 text-xs text-[#075dbd]">
                {sources.map((source) => <li key={source.url}><a href={source.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1 hover:underline">{source.name}<ExternalLink size={12} /></a></li>)}
              </ul>
            </div>
            <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
              <a href={result.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[#0866d6] px-4 text-sm font-semibold text-white transition hover:bg-[#075bbb] active:scale-[.98]"><ExternalLink size={15} />Originalanzeige öffnen</a>
              <Button type="button" variant="secondary" className="min-h-11" disabled={Boolean(saving) || isSaved} onClick={() => save(result)}>{isSaved ? <Check size={15} /> : <Plus size={15} />}{isSaved ? "Gemerkt" : saving === result.url ? "Speichert …" : "Merken"}</Button>
            </div>
          </article></Card>; })}
        </div>}
        <div className="mt-6">
          {nextCursor ? <Button type="button" variant="secondary" className="min-h-11 w-full sm:w-auto" disabled={loadingMore || loading} onClick={loadMore}><Plus size={16} />{loadingMore ? "Lädt weitere Stellen …" : "Mehr laden"}</Button> : results.length > 0 && <p className="text-sm text-muted">Alle passenden Stellen der durchsuchten Quellen sind angezeigt.</p>}
        </div>
      </section>}
    </WorkspaceShell>
  );
}
