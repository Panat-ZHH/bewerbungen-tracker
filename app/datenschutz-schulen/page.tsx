import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/legal-page";

export const metadata: Metadata = { title: "Datenschutz für Schulen | WendApply" };

export default function Page() {
  return <LegalPage docKey="schulen" />;
}
