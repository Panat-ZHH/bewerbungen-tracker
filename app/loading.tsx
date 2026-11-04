export default function Loading() {
  return (
    <main className="workspace-bg flex min-h-[100dvh] items-center justify-center px-5">
      <div role="status" className="flex items-center gap-3 text-sm text-muted">
        <span aria-hidden className="h-5 w-5 animate-spin rounded-full border-2 border-[#0866d6]/20 border-t-[#0866d6] motion-reduce:animate-none" />
        Einen Moment bitte …
      </div>
    </main>
  );
}
