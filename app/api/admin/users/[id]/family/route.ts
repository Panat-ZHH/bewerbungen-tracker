import { adminApi } from "@/lib/admin/server";

// Family package of one person (docs/access/ADMIN.md «Familienpaket»). Same guard as every /api/admin route (bearer token,
// platform admin, MFA, fresh login, rate limits; no cookies → CSRF-safe). The RPCs run with the admin's own session.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Ctx) { return adminApi().familyStatus(request, (await params).id); }
export async function POST(request: Request, { params }: Ctx) { return adminApi().familyGrant(request, (await params).id); }
export async function DELETE(request: Request, { params }: Ctx) { return adminApi().familyRevoke(request, (await params).id); }
