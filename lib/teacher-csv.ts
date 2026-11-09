/** CSV export helpers for the teacher class table. Pure functions (unit-tested). */

/** Neutralise spreadsheet formula injection: cells starting with = + - @ tab or CR get a leading apostrophe. */
export function guardFormula(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

/** Escape one cell for RFC-4180 CSV (quotes doubled, quoted when it contains separator, quote or newline). */
export function csvCell(value: unknown, separator = ";"): string {
  if (value === null || value === undefined) return "";
  const text = guardFormula(typeof value === "string" ? value : String(value));
  return text.includes(separator) || /["\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export type CsvColumn<T> = { header: string; value: (row: T) => unknown };

/** Builds CSV text (CRLF line ends, ";" separator for Swiss/German Excel). Prepend BOM when saving as file. */
export function toCsv<T>(rows: T[], columns: CsvColumn<T>[], separator = ";"): string {
  const lines = [columns.map((c) => csvCell(c.header, separator)).join(separator)];
  for (const row of rows) lines.push(columns.map((c) => csvCell(c.value(row), separator)).join(separator));
  return lines.join("\r\n") + "\r\n";
}

/** Triggers a browser download of the CSV (UTF-8 with BOM so Excel reads umlauts). */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob); const a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
