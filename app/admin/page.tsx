import { AdminApp } from "@/components/admin/admin-app";

// Rendered per request so the admin shell is never stored in the Netlify CDN / Next full-route cache
// (dynamic pages get "Cache-Control: private, no-cache, no-store"). The page itself holds no data; /api/admin/* does.
export const dynamic = "force-dynamic";

export default function AdminPage() {
  return <AdminApp />;
}
