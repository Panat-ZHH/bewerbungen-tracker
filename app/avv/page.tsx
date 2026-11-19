import type { Metadata } from "next";
import { publicMetadata, publicBreadcrumb } from "@/lib/seo/pages";
import { JsonLd } from "@/components/seo/json-ld";
import { SiteLegalPage } from "@/components/public/site-legal";

export const metadata: Metadata = publicMetadata({ canonical: "/avv" });

export default function Page() {
  return <><JsonLd data={publicBreadcrumb("/avv")} /><SiteLegalPage docKey="avv" downloadHref="/avv/download" /></>;
}
