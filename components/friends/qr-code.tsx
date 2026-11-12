"use client";

import { useMemo } from "react";
import { qrMatrix } from "@/lib/qr";

/** Local QR code (no external service). Always pure black on white so scanners work in dark mode too (the one allowed hex exception). */
export function QrCode({ value, label }: { value: string; label: string }) {
  const matrix = useMemo(() => qrMatrix(value), [value]);
  if (!matrix) return null;
  const quiet = 3;
  const size = matrix.length + quiet * 2;
  const path = matrix.flatMap((row, r) => row.map((dark, c) => (dark ? `M${c + quiet} ${r + quiet}h1v1h-1z` : ""))).join("");
  return (
    <svg role="img" aria-label={label} viewBox={`0 0 ${size} ${size}`} shapeRendering="crispEdges" className="h-44 w-44 rounded-[var(--radius-md)] border-[length:var(--border-w)] border-[var(--outline-fill)] shadow-[var(--shadow-sm)]" style={{ backgroundColor: "#fff" }}>
      <rect width={size} height={size} fill="#fff" />
      <path d={path} fill="#000" />
    </svg>
  );
}
