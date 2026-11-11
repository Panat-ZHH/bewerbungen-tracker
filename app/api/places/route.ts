import { suggestPlaces } from "@/lib/geo/places";

export const runtime = "nodejs";

// Autocomplete for the Ort field: Swiss localities from the official directory (public data, no personal data, no login needed).
// The directory stays on the server; the browser only ever receives a handful of suggestions.
export async function GET(request: Request) {
  const query = (new URL(request.url).searchParams.get("q") ?? "").trim();
  if (query.length > 60) return Response.json({ places: [] }, { status: 400, headers: { "Cache-Control": "no-store" } });
  return Response.json({ places: suggestPlaces(query, 8) }, { headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400" } });
}
