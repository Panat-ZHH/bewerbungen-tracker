"use client";

import { useMemo } from "react";
import { qrMatrix, qrPath } from "./qr";

/** Offline QR code as inline SVG. Always dark-on-white (with quiet zone) so scanners work in dark mode too; the ink contour sits outside the quiet zone. */
export function QrCode({ value, label, size = 176 }: { value: string; label: string; size?: number }) {
  const data = useMemo(() => { try { return qrPath(qrMatrix(value)); } catch { return null; } }, [value]);
  if (!data) return <p className="text-small text-muted">QR-Code nicht verfügbar (Link zu lang).</p>;
  return (
    <svg role="img" aria-label={label} viewBox={`0 0 ${data.size} ${data.size}`} width={size} height={size} shapeRendering="crispEdges" className="shrink-0 rounded-[var(--radius-md)] border-[length:var(--border-w)] border-[var(--outline)] shadow-[var(--shadow-sm)]">
      <rect width={data.size} height={data.size} fill="#fff" /><path d={data.path} fill="#111" />
    </svg>
  );
}
