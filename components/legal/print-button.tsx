"use client";

import { Printer } from "lucide-react";

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="legal-btn">
      <Printer size={15} aria-hidden /> Drucken / als PDF speichern
    </button>
  );
}
