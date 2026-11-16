import type { Metadata } from "next";
import { publicMetadata, publicBreadcrumb } from "@/lib/seo/pages";
import { JsonLd } from "@/components/seo/json-ld";
import { LegalPage } from "@/components/legal/legal-page";

export const metadata: Metadata = publicMetadata({ canonical: "/avv" });

export default function Page() {
  return <><JsonLd data={publicBreadcrumb("/avv")} /><LegalPage docKey="avv" downloadHref="/avv/download" /></>;
}
