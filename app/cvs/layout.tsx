import type { Metadata } from "next";

export const metadata: Metadata = { title: "Meine Dokumente" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
