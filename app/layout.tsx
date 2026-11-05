import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

export const metadata: Metadata = { title: "WendApply | Bewerbungen einfach im Blick", description: "Behalte deine Bewerbungen einfach im Blick." };
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#edf1f6" }, { media: "(prefers-color-scheme: dark)", color: "#0d1118" }],
};

// Runs before first paint so the saved theme never flashes. "system" (default) follows the OS.
const themeScript = `try{var t=localStorage.getItem("wendapply-theme");var d=t==="dark"||((!t||t==="system")&&matchMedia("(prefers-color-scheme: dark)").matches);if(d)document.documentElement.setAttribute("data-theme","dark")}catch(e){}`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="de" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body>{children}<Toaster /></body>
    </html>
  );
}
