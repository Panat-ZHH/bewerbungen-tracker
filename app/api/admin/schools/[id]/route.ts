import { adminApi } from "@/lib/admin/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Ctx) { return adminApi().school(request, (await params).id); }
export async function POST(request: Request, { params }: Ctx) { return adminApi().schoolAction(request, (await params).id); }
