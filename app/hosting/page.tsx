import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/legal-page";

export const metadata: Metadata = { title: "Hosting und Unterauftragsbearbeiter" };

export default function Page() {
  return <LegalPage docKey="hosting" />;
}
