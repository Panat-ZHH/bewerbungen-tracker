import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/legal-page";

export const metadata: Metadata = { title: "Datenschutz für Jugendliche | WendApply" };

export default function Page() {
  return <LegalPage docKey="jugend" />;
}
