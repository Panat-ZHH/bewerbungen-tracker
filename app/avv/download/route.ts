import { readLegalMarkdown } from "@/components/legal/docs";

export const dynamic = "force-static";

/** Downloadable Markdown of the AVV/DPA template (the same source as /avv). */
export async function GET() {
  const body = await readLegalMarkdown("avv");
  return new Response(body, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": 'attachment; filename="WendApply-AVV-Vorlage.md"',
    },
  });
}
