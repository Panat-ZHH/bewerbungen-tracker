import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Instrument_Sans } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

// Display font for titles and big numbers, calm sans for everything else (self-hosted by next/font, no request to Google at runtime).
const titleFont = Bricolage_Grotesque({ subsets: ["latin", "latin-ext"], display: "swap", variable: "--font-title" });
const bodyFont = Instrument_Sans({ subsets: ["latin", "latin-ext"], display: "swap", variable: "--font-body" });

export const metadata: Metadata = { title: { default: "WendApply | Deine Lehrstellensuche", template: "%s | WendApply" }, description: "Finde deine Lehrstelle und behalte deine Bewerbungen im Blick." };
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // must match --paper in app/globals.css (light / dark)
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#fff9ef" }, { media: "(prefers-color-scheme: dark)", color: "#15140f" }],
};

// Runs before first paint so the saved theme never flashes. "system" (default) follows the OS.
const themeScript = `try{var t=localStorage.getItem("wendapply-theme");var d=t==="dark"||((!t||t==="system")&&matchMedia("(prefers-color-scheme: dark)").matches);if(d)document.documentElement.setAttribute("data-theme","dark")}catch(e){}`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="de" suppressHydrationWarning className={`${titleFont.variable} ${bodyFont.variable}`}>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body>{children}<Toaster /></body>
    </html>
  );
}
