import type { Metadata } from "next";

export const metadata: Metadata = { title: { absolute: "Bewerbung | WendApply" } };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
