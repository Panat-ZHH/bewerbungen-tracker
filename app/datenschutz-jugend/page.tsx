import type { Metadata } from "next";
import { publicMetadata, publicBreadcrumb } from "@/lib/seo/pages";
import { JsonLd } from "@/components/seo/json-ld";
import { LegalPage } from "@/components/legal/legal-page";

export const metadata: Metadata = publicMetadata({ canonical: "/datenschutz-jugend" });

export default function Page() {
  return <><JsonLd data={publicBreadcrumb("/datenschutz-jugend")} /><LegalPage docKey="jugend" /></>;
}
