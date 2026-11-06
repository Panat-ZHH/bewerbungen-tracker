import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/legal-page";

export const metadata: Metadata = { title: "Löschkonzept am Klassenende | WendApply" };

export default function Page() {
  return <LegalPage docKey="loeschkonzept" />;
}
