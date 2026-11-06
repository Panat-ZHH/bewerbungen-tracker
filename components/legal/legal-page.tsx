import Link from "next/link";
import { Download } from "lucide-react";
import { BrandMark } from "@/components/ui/brand-mark";
import { LEGAL_CONTACT, LEGAL_DOCS, LEGAL_STAND, LEGAL_VERSION, legalDoc, readLegalMarkdown, type LegalKey } from "./docs";
import { Markdown, markdownHeadings } from "./markdown";
import { PrintButton } from "./print-button";
import "./legal.css";

/**
 * Minimal public layout for the legal documents (no login, no app shell). Static: the Markdown in docs/legal/ is read at build time.
 * Part d may provide components/public/public-shell.tsx; the merge step can swap the frame, the content stays.
 */
export async function LegalPage({ docKey, downloadHref }: { docKey: LegalKey; downloadHref?: string }) {
  legalDoc(docKey);
  const full = await readLegalMarkdown(docKey);
  // The frame renders title + Stand/Version/contact itself (from docs.ts); the Markdown keeps them so it stands alone as a download.
  const lines = full.split("\n");
  const title = lines[0].replace(/^# /, "");
  const md = lines.slice(1).filter((l) => !l.startsWith("**Stand:**")).join("\n");
  const toc = markdownHeadings(md).filter((h) => h.level === 2);
  return (
    <div className="legal-root">
      <header className="legal-top no-print">
        <Link href="/" className="legal-brand" aria-label="WendApply, zur Startseite"><BrandMark size={30} radius={9} /><span>WendApply</span></Link>
        <nav aria-label="Rechtliche Informationen" className="legal-nav">
          {LEGAL_DOCS.map((d) => <Link key={d.key} href={d.path} aria-current={d.key === docKey ? "page" : undefined}>{d.short}</Link>)}
        </nav>
      </header>
      <main className="legal-main">
        <article className="legal-article">
          <h1>{title}</h1>
          <div className="legal-meta">
            <span>Stand: {LEGAL_STAND}</span><span>Version: {LEGAL_VERSION}</span><span>Kontakt: <a href={`mailto:${LEGAL_CONTACT}`}>{LEGAL_CONTACT}</a></span>
          </div>
          <div className="legal-actions no-print">
            <PrintButton />
            {downloadHref && <a href={downloadHref} download className="legal-btn"><Download size={15} aria-hidden /> Als Markdown herunterladen</a>}
          </div>
          {toc.length > 3 && (
            <nav aria-label="Inhalt" className="legal-toc no-print">
              <strong>Inhalt</strong>
              <ol>{toc.map((h) => <li key={h.id}><a href={`#${h.id}`}>{h.text.replace(/^\d+\.\s*/, "")}</a></li>)}</ol>
            </nav>
          )}
          <Markdown source={md} />
        </article>
      </main>
      <footer className="legal-foot no-print">
        <p>WendApply · Entwurf, nicht juristisch geprüft · <a href={`mailto:${LEGAL_CONTACT}`}>{LEGAL_CONTACT}</a></p>
        <p>{LEGAL_DOCS.map((d, i) => <span key={d.key}>{i ? " · " : ""}<Link href={d.path}>{d.title}</Link></span>)} · <Link href="/impressum">Impressum</Link></p>
      </footer>
    </div>
  );
}
