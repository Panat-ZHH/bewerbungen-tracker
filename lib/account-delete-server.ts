import type { SupabaseClient } from "@supabase/supabase-js";

// SERVER ONLY (uses the service role client). Never import this from a client component.

export const USER_BUCKETS = ["cvs", "avatars"] as const;

type Entry = { name: string; id: string | null };

/** All object paths below `<userId>/` in a bucket (the Storage API lists one folder level at a time). */
export async function listUserObjects(admin: SupabaseClient, bucket: string, userId: string): Promise<string[]> {
  const out: string[] = [];
  const walk = async (prefix: string, depth: number) => {
    if (depth > 6) return;
    for (let offset = 0; ; offset += 100) {
      const { data, error } = await admin.storage.from(bucket).list(prefix, { limit: 100, offset });
      if (error) throw new Error(`STORAGE_LIST_FAILED:${bucket}:${error.message}`);
      const entries = (data ?? []) as Entry[];
      for (const e of entries) {
        if (e.id === null) await walk(`${prefix}/${e.name}`, depth + 1); // folder
        else out.push(`${prefix}/${e.name}`);
      }
      if (entries.length < 100) break;
    }
  };
  await walk(userId, 0);
  return out;
}

export async function deleteUserFiles(admin: SupabaseClient, userId: string): Promise<number> {
  let removed = 0;
  for (const bucket of USER_BUCKETS) {
    const paths = new Set(await listUserObjects(admin, bucket, userId));
    if (bucket === "cvs") {
      // Fallback: files that are recorded in the database but not found under the user's folder.
      const { data } = await admin.from("cvs").select("storage_path").eq("user_id", userId);
      for (const row of (data ?? []) as { storage_path: string | null }[]) if (row.storage_path) paths.add(row.storage_path);
    }
    const list = [...paths];
    for (let i = 0; i < list.length; i += 100) {
      const { error } = await admin.storage.from(bucket).remove(list.slice(i, i + 100));
      if (error) throw new Error(`STORAGE_REMOVE_FAILED:${bucket}:${error.message}`);
    }
    removed += list.length;
  }
  return removed;
}

export type DeletionResult = { files: number; classesTransferred: number; classesDeleted: number; remaining: Record<string, number> };

/** Order matters: classes are handed over, files go (a failure here aborts before any data is lost), then the auth user (cascade). */
export async function deleteAccount(admin: SupabaseClient, userId: string): Promise<DeletionResult> {
  const prepared = await admin.rpc("account_delete_prepare", { p_user_id: userId });
  if (prepared.error) throw new Error(`PREPARE_FAILED:${prepared.error.message}`);
  const files = await deleteUserFiles(admin, userId);
  const removed = await admin.auth.admin.deleteUser(userId);
  if (removed.error) throw new Error(`AUTH_DELETE_FAILED:${removed.error.message}`);
  const report = await admin.rpc("account_data_report", { p_user_id: userId });
  const info = (prepared.data ?? {}) as { classes_transferred?: number; classes_deleted?: number };
  return { files, classesTransferred: info.classes_transferred ?? 0, classesDeleted: info.classes_deleted ?? 0, remaining: (report.data ?? {}) as Record<string, number> };
}
