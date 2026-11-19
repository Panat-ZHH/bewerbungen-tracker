import Link from "next/link";
import { Download } from "lucide-react";
import { LEGAL_CONTACT, LEGAL_DOCS, LEGAL_STAND, LEGAL_VERSION, legalDoc, readLegalMarkdown, type LegalKey } from "@/components/legal/docs";
import { Markdown, markdownHeadings } from "@/components/legal/markdown";
import { PrintButton } from "@/components/legal/print-button";
import { PublicShell } from "./public-shell";
import "@/components/legal/legal.css";

/**
 * Legal document inside the website frame (header, footer). The TEXT is unchanged: the same Markdown from docs/legal/ as
 * components/legal/legal-page.tsx renders (title, Stand/Version/contact, print + download, table of contents). Only the frame differs.
 */
export async function SiteLegalPage({ docKey, downloadHref }: { docKey: LegalKey; downloadHref?: string }) {
  legalDoc(docKey);
  const full = await readLegalMarkdown(docKey);
  const lines = full.split("\n");
  const title = lines[0].replace(/^# /, "");
  const md = lines.slice(1).filter((l) => !l.startsWith("**Stand:**")).join("\n");
  const toc = markdownHeadings(md).filter((h) => h.level === 2);
  return (
    <PublicShell>
      <div className="s-hero">
        <div className="s-wrap s-narrow">
          <nav aria-label="Rechtliche Informationen" className="no-print">
            <ul className="s-legal-nav">
              {LEGAL_DOCS.map((d) => <li key={d.key}><Link href={d.path} aria-current={d.key === docKey ? "page" : undefined}>{d.short}</Link></li>)}
              <li><Link href="/impressum">Impressum</Link></li>
            </ul>
          </nav>
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
          <p className="s-fine" style={{ marginTop: 48 }}>Entwurf, nicht juristisch geprüft.</p>
        </div>
      </div>
    </PublicShell>
  );
}
