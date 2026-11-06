import Link from "next/link";
import type { ReactNode } from "react";

/** Tiny, safe Markdown renderer for our own legal documents (no HTML passthrough): headings, paragraphs, lists, tables, quotes, bold, code, links. */

export function slugify(text: string): string {
  return text.toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function inline(text: string, keyPrefix = "i"): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*([^*]+)\*\*)|(`([^`]+)`)|(\[([^\]]+)\]\(([^)\s]+)\))/g;
  let last = 0, n = 0, m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const key = `${keyPrefix}${n++}`;
    if (m[1]) out.push(<strong key={key}>{inline(m[2], key)}</strong>);
    else if (m[3]) out.push(<code key={key}>{m[4]}</code>);
    else {
      const href = m[7];
      if (href.startsWith("/")) out.push(<Link key={key} href={href}>{m[6]}</Link>);
      else if (/^(https:\/\/|mailto:)/.test(href)) out.push(<a key={key} href={href} rel="noopener noreferrer">{m[6]}</a>);
      else out.push(m[0]);
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Plain text of a heading line, used for ids. */
const plain = (s: string) => s.replace(/[*`]/g, "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");

export function markdownHeadings(md: string): { level: number; text: string; id: string }[] {
  return md.split("\n").map((l) => /^(#{2,3}) (.+)$/.exec(l)).filter((m): m is RegExpExecArray => Boolean(m)).map((m) => ({ level: m[1].length, text: plain(m[2]), id: slugify(plain(m[2])) }));
}

const splitRow = (line: string) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());

export function Markdown({ source }: { source: string }) {
  const lines = source.replace(/\r/g, "").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0, k = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    const h = /^(#{1,3}) (.+)$/.exec(line);
    if (h) {
      const id = slugify(plain(h[2]));
      if (h[1].length === 1) blocks.push(<h1 key={k++}>{inline(h[2])}</h1>);
      else if (h[1].length === 2) blocks.push(<h2 key={k++} id={id}>{inline(h[2])}</h2>);
      else blocks.push(<h3 key={k++} id={id}>{inline(h[2])}</h3>);
      i++; continue;
    }
    if (/^---+$/.test(line.trim())) { blocks.push(<hr key={k++} />); i++; continue; }
    if (line.startsWith(">")) {
      const quote: string[] = [];
      while (i < lines.length && lines[i].startsWith(">")) quote.push(lines[i++].replace(/^>\s?/, ""));
      blocks.push(<blockquote key={k++}>{inline(quote.join(" "))}</blockquote>);
      continue;
    }
    if (line.trim().startsWith("|") && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1] ?? "")) {
      const head = splitRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) rows.push(splitRow(lines[i++]));
      blocks.push(
        <div key={k++} className="legal-table"><table>
          <thead><tr>{head.map((c, j) => <th key={j}>{inline(c)}</th>)}</tr></thead>
          <tbody>{rows.map((r, a) => <tr key={a}>{r.map((c, j) => <td key={j}>{inline(c)}</td>)}</tr>)}</tbody>
        </table></div>,
      );
      continue;
    }
    const ul = /^[-*] (.+)$/.test(line), ol = /^\d+\. (.+)$/.test(line);
    if (ul || ol) {
      const items: string[] = [];
      const re = ul ? /^[-*] (.+)$/ : /^\d+\. (.+)$/;
      while (i < lines.length) {
        const m = re.exec(lines[i]);
        if (m) { items.push(m[1]); i++; }
        else if (/^\s{2,}\S/.test(lines[i]) && items.length) { items[items.length - 1] += " " + lines[i].trim(); i++; }
        else break;
      }
      const li = items.map((t, j) => <li key={j}>{inline(t)}</li>);
      blocks.push(ul ? <ul key={k++}>{li}</ul> : <ol key={k++}>{li}</ol>);
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,3} |>|\||[-*] |\d+\. |---+$)/.test(lines[i].trim())) para.push(lines[i++].trim());
    if (!para.length) para.push(lines[i++]);
    blocks.push(<p key={k++}>{para.flatMap((p, j) => (j ? [<br key={`b${j}`} />, ...inline(p, `p${j}`)] : inline(p, "p0")))}</p>);
  }
  return <>{blocks}</>;
}
