import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Instrument_Sans } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { PwaRegister } from "@/components/pwa/PwaRegister";
import { InstallHint } from "@/components/pwa/InstallHint";
import { BRAND_TAGLINE } from "@/components/public/marketing";

// Display font for titles and big numbers, calm sans for everything else (self-hosted by next/font, no request to Google at runtime).
const titleFont = Bricolage_Grotesque({ subsets: ["latin", "latin-ext"], display: "swap", variable: "--font-title" });
const bodyFont = Instrument_Sans({ subsets: ["latin", "latin-ext"], display: "swap", variable: "--font-body" });

export const metadata: Metadata = {
  title: { default: "WendApply | Deine Lehrstellensuche", template: "%s | WendApply" },
  description: BRAND_TAGLINE,
  applicationName: "WendApply",
  // PWA: manifest comes from app/manifest.ts; icons from public/icons (scripts/pwa-icons.mjs). app/icon.png stays the default favicon.
  appleWebApp: { capable: true, title: "WendApply", statusBarStyle: "default" },
  formatDetection: { telephone: false },
  // Next only emits the generic mobile-web-app-capable tag; older iOS versions still look for the Apple one.
  other: { "apple-mobile-web-app-capable": "yes" },
  icons: {
    icon: [{ url: "/icons/icon-32.png", sizes: "32x32", type: "image/png" }, { url: "/icons/icon-16.png", sizes: "16x16", type: "image/png" }, { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};
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
      <body>{children}<Toaster /><InstallHint /><PwaRegister /></body>
    </html>
  );
}
