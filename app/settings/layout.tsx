import type { Metadata } from "next";

export const metadata: Metadata = { title: "Einstellungen" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
