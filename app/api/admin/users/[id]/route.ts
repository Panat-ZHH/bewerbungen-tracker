import { adminApi } from "@/lib/admin/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Ctx) { return adminApi().user(request, (await params).id); }
export async function POST(request: Request, { params }: Ctx) { return adminApi().userAction(request, (await params).id); }
