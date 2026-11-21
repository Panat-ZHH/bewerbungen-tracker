# Parent village view: RPC contract

A parent (`/familie`) can see their child's **real** village **read-only**. Migration:
`supabase/migrations/20261121100000_family_child_village.sql` (rollback: `supabase/rollback/20261121100000_family_child_village.down.sql`).
Tests: `tests/family-child-village-db.test.mjs` (PGlite, full migration chain, Supabase default privileges).

## Call

```ts
const { data, error } = await supabase.rpc("family_child_village", { p_child_id: childUserId });
```

`SECURITY DEFINER`, `search_path = ''`, EXECUTE for `authenticated` only (not `anon`, `public` or `service_role`).
The function is wrapped by `public._acc_wrap('family_child_village', 'uuid', 'all')`, exactly like `family_child_overview`.
The real logic is in `public._acc_impl_family_child_village` (no client grants). Calling it writes nothing.

## Response (final shape)

```jsonc
{
  "child_id": "uuid",              // the child's auth user id
  "display_name": "Kim",           // user_roles.display_name, trimmed; null if empty
  "island_count": 1,               // public.map_islands_count(child), 1 = only the free first island
  "show_companies": false,         // = child's share_settings.applications
  "houses": [                      // one per application of the child, OLDEST FIRST (created_at, id)
    { "id": "app-id", "status": "applied", "company": null }   // company only if show_companies (trimmed, max 80 chars, "" -> null)
  ],
  "layouts": [                     // moved houses, exactly as map_shop_state returns them (MapLayout)
    { "id": "house:app-id", "x": 3, "z": 4, "rotation": 1 }
  ],
  "items": [                       // bought shop items, exactly as map_shop_state returns them (OwnedMapItem)
    { "id": "uuid", "itemType": "tree", "x": 7, "z": 2, "rotation": 2, "createdAt": "2026-11-21T10:00:00+00:00" }  // x/z null = not placed
  ]
}
```

There are no other keys, at any level. Never returned: notes, salary, position, location, links, source, job description,
deadlines, contacts, files/CVs, wallet balance, classes, classmates, schools or other families.

### Changes against the agreed draft (please read, UI part)

1. **`houses[].id` is `text`, not `uuid`.** `public.applications.id` is a text column (the app writes its own ids). Use it as is.
2. **`layouts[].id` is `text` like `"house:<application id>"`, not a bare uuid.** That is what `map_layouts.object_id` stores and what
   `map_shop_state` / `lib/map-shop.ts` `MapLayout` use, so `villageObjects(applications, layouts)` works unchanged. Only layouts of
   houses that still exist are returned (stray rows of deleted applications are dropped).
3. **`houses` have no `createdAt`** (contract: no extra fields). They are already sorted the way `createApplicationMap()` sorts
   (`created_at`, then `id`). To reuse `createApplicationMap()` / `villageObjects()`, map them to `Application`-like objects with a
   `createdAt` that keeps this order, e.g. `createdAt: String(index).padStart(6, "0")`, plus `company: company ?? ""`.
4. **No REAUTH_REQUIRED.** `_acc_wrap(..., 'all')` is the paywall guard (`_assert_app_access()` → `PAYWALL`), the same as
   `family_child_overview`. REAUTH_REQUIRED (MFA + fresh login) exists only for the admin family RPCs
   (`20261120100000_admin_family_grant.sql`); parents are not required to have MFA, so it is not added here.
5. **Not shared = an error.** `family_child_overview` answers "not shared" with `sharing_active: false` + `reason` instead of raising.
   This RPC raises `NOT_SHARED` (the code `map_friend_island` uses for a hidden island) with the reason in the error **hint**.

## Errors

All are `P0001` with the code as `error.message`; `detail` is German UI text, `hint` (NOT_SHARED only) a machine reason.

| message | when | hint |
|---|---|---|
| `AUTH_REQUIRED` | no session | |
| `NOT_IN_FAMILY` | caller is in no family (detail: «Du bist in keiner Familie.») | |
| `FORBIDDEN` | caller is not an **active parent** (the child itself, other children, pending parents) | |
| `NOT_FOUND` | `p_child_id` is not an active child of the caller's family (other families, removed children, parents) | |
| `NOT_SHARED` | consent missing (under 16, not granted yet) | `consent_pending` |
| `NOT_SHARED` | consent withdrawn | `consent_withdrawn` |
| `NOT_SHARED` | child has `share_settings.village = false` | `village_off` |
| `PAYWALL` | caller has no app access (access guard, like the overview) | |

Every call checks again, so withdrawing consent, switching the village off or removing the child hides the village at once.

Suggested UI copy (FAMILY_COPY tone):
- `consent_pending`: «Das Dorf wird sichtbar, sobald du als Elternteil eingewilligt hast.»
- `consent_withdrawn`: «Die Einwilligung wurde zurückgezogen. Das Dorf ist gerade nicht sichtbar.»
- `village_off`: «Dein Kind teilt sein Dorf gerade nicht. Das ist okay: es entscheidet selbst, was es zeigt.»
- `NOT_FOUND` / `FORBIDDEN`: «Dieses Dorf können wir dir nicht zeigen.»

## Rules (same checks as `family_child_overview`)

- Caller: active parent (`family_members.role = 'parent' and status = 'active'`).
- Child: `role = 'child' and status = 'active'` in the **same** family.
- `public._family_sharing_allowed(child)`: consent granted, or not needed (16+ by birth year).
- `share_settings.village = true`; company names only if `share_settings.applications = true`.
