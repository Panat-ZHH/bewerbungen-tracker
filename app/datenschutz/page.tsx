import type { Metadata } from "next";
import { publicMetadata, publicBreadcrumb } from "@/lib/seo/pages";
import { JsonLd } from "@/components/seo/json-ld";
import { LegalPage } from "@/components/legal/legal-page";

export const metadata: Metadata = publicMetadata({ canonical: "/datenschutz" });

export default function Page() {
  return <><JsonLd data={publicBreadcrumb("/datenschutz")} /><LegalPage docKey="datenschutz" /></>;
}
