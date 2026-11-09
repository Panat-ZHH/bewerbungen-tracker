import type { Metadata } from "next";

export const metadata: Metadata = { title: "Mein Profil" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
