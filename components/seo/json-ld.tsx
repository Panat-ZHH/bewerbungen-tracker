import { jsonLdString } from "@/lib/seo/site";

/** Renders structured data. Server component, no client JS. */
export function JsonLd({ data }: { data: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(data) }} />;
}
