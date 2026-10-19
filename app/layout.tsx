import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "WendApply | Bewerbungen einfach im Blick", description: "Behalte deine Bewerbungen einfach im Blick." };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="de"><body>{children}</body></html>;
}