import { adminApi } from "@/lib/admin/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = (request: Request) => adminApi().audit(request);
