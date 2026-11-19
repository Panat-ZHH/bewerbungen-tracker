import type { Metadata } from "next";

// Inherits NOINDEX from app/layout.tsx (personal, client-only screens).
export const metadata: Metadata = {
  title: "Kostenlos testen",
  description: "Beantworte ein paar kurze Fragen und erhalte deinen Plan – von der Bewerbung bis zum unterschriebenen Lehrvertrag.",
};

export default function StartLayout({ children }: { children: React.ReactNode }) {
  return children;
}
