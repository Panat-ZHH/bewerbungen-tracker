import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "WendApply | Bewerbungen einfach im Blick", description: "Behalte deine Bewerbungen einfach im Blick." };
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#edf1f6" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="de"><body>{children}</body></html>;
}
