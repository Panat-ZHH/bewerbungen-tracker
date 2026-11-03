"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ExternalLink, MapPin, Plus, Search } from "lucide-react";
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
      <h1 className="text-3xl font-semibold">Finde deine Stelle</h1>
      <form onSubmit={submit} className="mt-7 max-w-3xl space-y-5">
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Was suchst du?</legend>
          <div className="inline-flex gap-1 rounded-full border border-white/80 bg-white/50 p-1">
            {([{ value: "apprenticeship", label: "Lehrstelle" }, { value: "job", label: "Job" }] as const).map((option) => (
              <label key={option.value} className={`cursor-pointer rounded-full px-5 py-2 text-sm font-medium transition has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[#0866d6] ${kind === option.value ? "bg-white text-[#075dbd] shadow-sm" : "text-[#5e5e63]"}`}>
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
        <Button type="submit" disabled={loading}><Search size={17} />{loading ? "Sucht …" : "Stellen suchen"}</Button>
      </form>

      {error && <p role="alert" className="mt-6 max-w-3xl rounded-xl border border-[#e8c7c7] bg-[#fff8f8] px-4 py-3 text-sm text-[#a32828]">{error}</p>}
      {notice && <p role="status" className="glass-surface mt-5 max-w-3xl px-4 py-3 text-sm">{notice}</p>}
      {loading && <div role="status" className="mt-8 space-y-3"><p className="text-sm text-muted">Passende Anzeigen werden gesucht …</p>{[0, 1, 2].map((item) => <div key={item} className="h-28 animate-pulse rounded-lg bg-white/60" />)}</div>}
      {searched && <section className="mt-9">
        <h2 className="text-lg font-semibold break-words">{searched}</h2>
        <p className="mt-1 text-sm text-muted" aria-live="polite">{results.length} Treffer</p>
        {sourceStatuses.length > 0 && <ul aria-label="Durchsuchte Quellen" className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted">
          {sourceStatuses.map((source) => <li key={source.name}>{source.name}{source.status === "unavailable" ? " · gerade nicht erreichbar" : " · durchsucht"}</li>)}
        </ul>}
        {!results.length ? <p className="glass-surface mt-5 px-5 py-7 text-sm">Keine passenden Anzeigen gefunden. Probiere einen anderen Beruf oder Ort.</p> : <div className="mt-4 divide-y divide-[#d6dce5] border-y border-[#d6dce5]">
          {results.map((result) => {
            const sources = listingSources(result);
            const isSaved = sources.some((source) => saved.has(source.url));
            return <article key={result.url} className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h3 className="break-words text-base font-semibold">{result.title}</h3>
              {result.company && <p className="mt-1 break-words text-sm">{result.company}</p>}
              <p className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted">{result.location && <span className="inline-flex items-center gap-1"><MapPin size={13} />{result.location}</span>}<span>{sources.length > 1 ? `${sources.length} Quellen` : result.source}</span></p>
              <ul aria-label="Originalanzeigen" className="mt-2 flex flex-wrap gap-3 text-xs text-[#075dbd]">
                {sources.map((source) => <li key={source.url}><a href={source.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-8 items-center gap-1 hover:underline">{source.name}<ExternalLink size={12} /></a></li>)}
              </ul>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <a href={result.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center gap-2 rounded-full bg-[#0866d6] px-4 text-sm font-semibold text-white hover:bg-[#075bbb]"><ExternalLink size={15} />Originalanzeige öffnen</a>
              <Button type="button" variant="secondary" disabled={Boolean(saving) || isSaved} onClick={() => save(result)}>{isSaved ? <Check size={15} /> : <Plus size={15} />}{isSaved ? "Gemerkt" : saving === result.url ? "Speichert …" : "Merken"}</Button>
            </div>
          </article>; })}
        </div>}
        <div className="mt-6">
          {nextCursor ? <Button type="button" variant="secondary" disabled={loadingMore || loading} onClick={loadMore}><Plus size={16} />{loadingMore ? "Lädt weitere Stellen …" : "Mehr laden"}</Button> : results.length > 0 && <p className="text-sm text-muted">Alle passenden Stellen der durchsuchten Quellen sind angezeigt.</p>}
        </div>
      </section>}
    </WorkspaceShell>
  );
}