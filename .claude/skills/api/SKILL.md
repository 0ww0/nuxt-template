---
name: api
description: Handles the HTTP layer of this Nuxt 4 + NuxtHub project — adding or modifying any route handler, service, presenter, or input validation. Use it to choose between a COLLECTION resource (many rows: list/create/read/update/delete) and a SINGLETON resource (one config-style row: get + upsert), to write thin method-suffixed handlers, validate input with Zod (strict bodies, partial PATCH, coerced route params), shape responses with presenters, cache singleton GETs with cachedEventHandler, version endpoints, and handle errors and status codes. Also the reference for the TypeScript gotchas in this stack (noUncheckedIndexedAccess + RETURNING, upsert with NOT NULL columns). Trigger on casual phrasing too ("add an endpoint", "validate this body", "make a settings API", "why is row possibly undefined", "cache the response", "purge the cache"). For tables/migrations/queries use the database skill; for scaffolding a whole collection CRUD at once, AGENTS.md has the end-to-end recipe.
---

# API Skill — endpoint & service patterns

The HTTP layer of this project. Sits above the repository. Use it to add or change endpoints the right way.

## Layered flow (never skip a layer)

```
route handler (server/api/v{N}/<resource>/*.<method>.ts)  → HTTP only
        ↓
service (server/services/<entity>.service.ts)             → business rules, HTTP-agnostic, SHARED across versions
        ↓
repository (server/repositories/<entity>.repository.ts)   → the ONLY layer that imports @nuxthub/db
```

Hard rules: handlers are thin (validate → delegate → present, ~10 lines or fewer); services never touch `event`/status codes and throw domain errors from `server/utils/errors.ts`; only repositories run queries; version the edge, not the core (services/repositories are shared across `v1`, `v2`, …).

## Step 0 — pick the resource shape

| | Collection | Singleton |
|---|---|---|
| Example | `users` | `info`, `seo`, `analytics`, `contact`, `general` |
| Rows | many | exactly one (pinned `id = 1`) |
| Endpoints | list, create, read(:id), update(:id), delete(:id) | `GET` (cached read) + `POST`/`PATCH` (upsert + cache purge) |
| Reference | `users` slice + **AGENTS.md** | any of the five settings slices + §2 below |

If it's a collection, follow **AGENTS.md** §3–4. If it's a singleton (settings, site config, feature flags as one record), use §2 here.

---

## §1 Endpoint conventions (both shapes)

**Routing** — one file per HTTP method under `server/api/v{N}/<resource>/`: `index.get.ts`, `index.post.ts`, `[id].get.ts`, `[id].patch.ts`, `[id].delete.ts`. Nitro returns 405 automatically for unhandled methods — do NOT write a method switch or a 405 branch.

**Validation (Zod, in `shared/schemas/v{N}/`)** — import the schema on both the server and the client.
- Body: `await readValidatedBody(event, createXV1Schema.parse)`.
- Route params: `await getValidatedRouterParams(event, z.object({ id: z.coerce.number().int().positive() }).parse)`.
- PATCH bodies: `createSchema.partial().refine(v => Object.keys(v).length > 0, …)`.
- Add `.strict()` to update/patch schemas to block mass-assignment of `id`/`createdAt`/etc.

**Presenters (`server/utils/presenters/<entity>.v{N}.ts`)** — define the response contract and convert dates.
- Few fields → hand-list them (see `user.v1`).
- Many fields / "return the whole record" → spread and convert timestamps (see `info.v1`, `seo.v1`, all settings presenters).
- SKIP a presenter only when the client controls the shape — note it in the handler.

**Status codes** — create → `setResponseStatus(event, 201)`; delete → `204` and `return null`. Reads/updates → default 200.

**Errors** — throw `notFound(x)` / `conflict(msg)` from `server/utils/errors.ts` in the service.

**Versioning** — only `server/api/v{N}/` folders are versioned. A new version usually means a new presenter + (maybe) a new Zod schema, calling the SAME service.

---

## §2 Singleton resource pattern

One logical row, pinned to a constant id. Get-or-create via an atomic upsert.

### Existing singletons (do not re-scaffold)

| Resource | Schema file | Table | Write gate | GET cache TTL |
|---|---|---|---|---|
| `info` | `infoSetting.ts` | `info_settings` | `super_admin` | 24 h |
| `seo` | `seoSetting.ts` | `seo_settings` | `super_admin` | 24 h |
| `analytics` | `analyticSetting.ts` | `analytics_settings` | `super_admin` | 1 h |
| `general` | `generalSetting.ts` | `general_settings` | `super_admin` | 5 min |
| `contact` | `contactSetting.ts` | `contact_settings` | `admin` | 6 h |

All five follow identical structure. Mirror any of them for a new singleton.

> **Naming convention for singleton schema files:** use the `<Entity>Setting.ts` suffix (e.g. `infoSetting.ts`) to distinguish from collection schemas. The Drizzle export uses plural camelCase (`infoSettings`), types are `InfoSetting` / `NewInfoSetting`.

> **History note.** These five tables were previously all columns on the `informations` table. Do not add new settings columns to `informations` — create a new singleton table instead.

### Routes

A singleton exposes **three** route files — no `[id]` routes:

```
server/api/v{N}/<resource>/
  index.get.ts    ← cachedEventHandler (public read + cache)
  index.post.ts   ← upsert + cache purge (role-gated)
  index.patch.ts  ← upsert + cache purge (role-gated, identical body to POST)
```

Both `POST` and `PATCH` call `service.save(body)` and then purge the cache.

### GET — `cachedEventHandler` with deterministic key

```ts
// server/api/v1/<resource>/index.get.ts
import { <entity>Service } from '../../../services/<entity>.service'
import { present<Entity>V1 } from '../../../utils/presenters/<entity>.v1'

export const <ENTITY>_CACHE_KEY = 'api:v1:<resource>'

// Exported so write handlers can purge exactly this entry.
// Pattern: `nitro:handlers:<name>:<getKey>.json`
export const <ENTITY>_CACHE_STORAGE_KEY = `nitro:handlers:${<ENTITY>_CACHE_KEY}:singleton.json`

export default cachedEventHandler(async () => {
  return present<Entity>V1(await <entity>Service.get())
}, {
  name: <ENTITY>_CACHE_KEY,
  getKey: () => 'singleton',  // constant key → one deterministic cache entry
  maxAge: 60 * 60 * 24,       // choose TTL appropriate for the resource
})
```

> **Why `getKey: () => 'singleton'`?** Without a pinned key, Nitro appends a hash of the request URL. The write handler's purge would target the wrong key and silently no-op, leaving stale data until the TTL expires.

### POST/PATCH — upsert + cache purge

```ts
// server/api/v1/<resource>/index.post.ts  (and index.patch.ts — identical)
import { update<Entity>V1Schema } from '~~/shared/schemas/v1/<entity>.schema'
import { <entity>Service } from '../../../services/<entity>.service'
import { present<Entity>V1 } from '../../../utils/presenters/<entity>.v1'
import { requireMinRole } from '../../../utils/auth'
import { <ENTITY>_CACHE_STORAGE_KEY } from './index.get'

export default defineEventHandler(async (event) => {
  await requireMinRole(event, '<role>')
  const body = await readValidatedBody(event, update<Entity>V1Schema.parse)
  const result = await <entity>Service.save(body)
  await useStorage('cache').removeItem(<ENTITY>_CACHE_STORAGE_KEY)
  return present<Entity>V1(result)
})
```

### Repository (`server/repositories/<entity>.repository.ts`)

```ts
import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import type { <Entity>Setting, New<Entity>Setting } from '../db/schema'

const SINGLETON_ID = 1
const INSERT_DEFAULTS = { /* required NOT NULL cols */ } satisfies Partial<New<Entity>Setting>

export const <entity>Repository = {
  find() {
    return db.query.<entity>Settings.findFirst({ where: eq(schema.<entity>Settings.id, SINGLETON_ID) })
  },
  async upsert(data: Partial<New<Entity>Setting>): Promise<<Entity>Setting> {
    const [row] = await db
      .insert(schema.<entity>Settings)
      .values({ id: SINGLETON_ID, ...INSERT_DEFAULTS, ...data } as New<Entity>Setting)
      .onConflictDoUpdate({
        target: schema.<entity>Settings.id,
        set: { ...data, updatedAt: new Date() },
      })
      .returning()
    return row! // upsert always writes exactly one row
  },
}
```

### Service (`server/services/<entity>.service.ts`)

```ts
export const <entity>Service = {
  async get() {
    const row = await <entity>Repository.find()
    if (!row) throw notFound('<Entity> settings (PATCH /api/v{N}/<resource> to create it)')
    return row
  },
  save(data: Partial<New<Entity>Setting>) {
    return <entity>Repository.upsert(data)
  },
}
```

> **Naming:** the service method is `save()`, the repository method is `upsert()`. Keep this distinction — it matches all five existing singletons.

### Zod schema (`shared/schemas/v{N}/<entity>.schema.ts`)

```ts
export const update<Entity>V1Schema = z
  .object({
    someField: z.string().nullable().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'Provide at least one field to update' })
```

### Presenter

Settings singletons spread the row and convert timestamps (no secrets to omit):

```ts
export function present<Entity>V1(row: <Entity>Setting) {
  return { ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() }
}
```

### Seed (`server/api/dev/seed.post.ts`)

Pin the seed row to `id: 1`:
```ts
await db.insert(schema.<entity>Settings).values({ id: 1, /* required cols */ })
```

---

## §3 TypeScript gotchas (`noUncheckedIndexedAccess`)

1. **`const [row] = await db…returning()` is `T | undefined`.**
   - Always-one-row ops (`create`, `upsert`) → `return row!` with non-optional return type.
   - May-be-missing ops (`findById`, `update` by arbitrary id) → keep `| undefined`.
   - When caller knows the row exists (after a guard): `presentV1((await service.update(id, body))!)`.
2. **Upsert + NOT NULL columns** — merge `INSERT_DEFAULTS` into `.values()` and cast `as New<Entity>Setting`; keep `set:` limited to `data` so defaults don't overwrite real values.
3. **`db`/`schema` import** — always `@nuxthub/db`, never the legacy `hub:db`. Only inside repositories.

---

## §4 Definition of done
- [ ] Resource shape chosen (collection → AGENTS.md; singleton → §2).
- [ ] Handlers thin; no business logic or DB calls in routes.
- [ ] Body validated with a `shared/schemas/v{N}` Zod schema; update schema uses `.strict().refine(...)`.
- [ ] Service is HTTP-agnostic and throws `notFound`/`conflict`.
- [ ] Presenter applied (or its absence justified).
- [ ] Singleton GETs use `cachedEventHandler` with `name` + `getKey: () => 'singleton'` + exported `CACHE_STORAGE_KEY`; writes purge via `useStorage('cache').removeItem(KEY)`.
- [ ] Correct status codes (201/204) and no manual 405.
- [ ] No `T | undefined` type errors (§3); `npx nuxt typecheck` passes.

## Relationship to the other docs
- **database skill** — schema, migrations, seeding, query authoring.
- **AGENTS.md** — end-to-end recipe + templates for a full *collection* CRUD slice.
- **rbac skill** — `requireMinRole`/`requireRole` for gating singleton writes.
