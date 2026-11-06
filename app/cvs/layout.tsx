import type { Metadata } from "next";

export const metadata: Metadata = { title: "Lebensläufe" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
