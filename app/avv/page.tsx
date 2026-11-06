import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/legal-page";

export const metadata: Metadata = { title: "Auftragsbearbeitung (AVV/DPA) | WendApply" };

export default function Page() {
  return <LegalPage docKey="avv" downloadHref="/avv/download" />;
}
