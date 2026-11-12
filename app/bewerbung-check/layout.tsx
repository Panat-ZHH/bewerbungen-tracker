import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Bewerbungs-Check",
  description: "Lade deine Bewerbung hoch und bekomm von einer KI Tipps, was schon gut ist und was du verbessern kannst.",
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
