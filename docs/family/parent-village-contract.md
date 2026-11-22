# Parent village view: RPC contract

A parent (`/familie`) can watch their child's **real** village **read-only**, exactly as the child sees it. Migrations:
`20261121100000_family_child_village.sql`, `20261122100000_family_child_village_like_friend.sql`, current: `supabase/migrations/20261122190000_family_child_village_full_details.sql`
(rollbacks in `supabase/rollback/`).
Tests: `tests/family-child-village-db.test.mjs` (PGlite, full migration chain, Supabase default privileges).

## Call

```ts
const { data, error } = await supabase.rpc("family_child_village", { p_child_id: childUserId });
```

`SECURITY DEFINER`, `search_path = ''`, EXECUTE for `authenticated` only (not `anon`, `public` or `service_role`).
The function is wrapped by `public._acc_wrap('family_child_village', 'uuid', 'all')`, exactly like `family_child_overview`.
The real logic is in `public._acc_impl_family_child_village` (no client grants). Calling it writes nothing.

> **2026-11-22 19:00 (`20261122190000_family_child_village_full_details.sql`): the parent sees EXACTLY the child's own village.**
> Replaces the friend-like payload of `20261122100000` (pseudo ids, masked results, «Haus N»), which Panat rejected. Real
> application ids, real statuses (Zusage = palace, Absage = ruin), company, Stelle, location and dates: precisely the fields the
> child's own `/map` shows on the house label and in the house sheet (`components/applications/map-application-dialog.tsx`).
> `share_settings.applications` no longer matters here and `show_companies` is gone. The page renders the child's own
> `VillageMap` (`components/applications/village-map.tsx`) with `watch` = strictly read-only.
> Rollback: `supabase/rollback/20261122190000_family_child_village_full_details.down.sql` (restores 20261122100000 exactly).

## Response (final shape since 20261122190000)

```jsonc
{
  "child_id": "uuid",              // the child's auth user id
  "display_name": "Kim",           // user_roles.display_name, trimmed; null if empty
  "island_count": 1,               // public.map_islands_count(child), 1 = only the free first island
  "houses": [                      // one per application of the child, OLDEST FIRST (created_at, id)
    {
      "id": "<application id>",    // real id (text), as in the child's /map -> same roof colours / ruin shapes
      "company": "Kinder AG",      // raw, as the child entered it (house label)
      "position": "Informatiker",  // Stelle (house sheet title, search list)
      "location": "Winterthur",    // null if empty (house sheet)
      "status": "rejected",        // real status, never masked
      "createdAt": "2026-11-01",   // «Erfasst am»; also the house order on the map
      "updatedAt": "2026-11-02",   // «Letzte Änderung»
      "appliedAt": "2026-11-03",   // «Abgeschickt am», null if not set
      "deadline": "2026-12-01"     // «Bewerbungsfrist», null if not set
    }
  ],
  "layouts": [                     // moved houses, exactly as map_shop_state returns them (MapLayout)
    { "id": "house:<application id>", "x": 3, "z": 4, "rotation": 1 }
  ],
  "items": [                       // bought shop items, exactly as map_shop_state returns them (OwnedMapItem)
    { "id": "uuid", "itemType": "tree", "x": 7, "z": 2, "rotation": 2, "createdAt": "2026-11-21T10:00:00+00:00" }  // x/z null = not placed
  ]
}
```

There are no other keys, at any level. Never returned: notes (the child's sheet shows «Deine Notizen», but notes stay private
by product promise), salary, currency, links (job_url), source, job description, match score, CV type, contacts,
Schnupper/test details, files/CVs, wallet balance / points, classes, classmates, schools or other families.

Client: `lib/family-village.ts` `parseFamilyVillage` copies only these fields into `Application` objects (`category: "other"`,
not displayed). An older payload (pseudo ids, no company/position/dates) still renders with «Haus N» labels in RPC order.

### Earlier notes (UI part, still valid)

1. **`houses[].id` is `text`, not `uuid`.** `public.applications.id` is a text column (the app writes its own ids).
2. **`layouts[].id` is `"house:<application id>"`**, what `map_layouts.object_id` stores and `map_shop_state` returns. Only
   layouts of houses that still exist are returned.
3. **No REAUTH_REQUIRED.** `_acc_wrap(..., 'all')` is the paywall guard (`_assert_app_access()` → `PAYWALL`), the same as
   `family_child_overview`. Parents are not required to have MFA.
4. **Not shared = an error** `NOT_SHARED` with the reason in the error **hint**.

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
- `share_settings.village = true`. Then the parent always gets the full house details above (`share_settings.applications` only
  controls the separate application list in `family_child_overview`).
