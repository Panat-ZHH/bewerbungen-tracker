export default function Loading() {
  return (
    <main className="workspace-bg flex min-h-[100dvh] items-center justify-center px-5">
      <div role="status" className="animate-fade flex items-center gap-3 text-body text-muted">
        <span aria-hidden className="spinner h-5 w-5 text-[var(--brand)]" />
        Einen Moment bitte …
      </div>
    </main>
  );
}
