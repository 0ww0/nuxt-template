# AGENTS.md — How to add a CRUD resource to this project

This file tells an AI agent (Claude Code, Cursor, etc.) **exactly** how this
codebase is structured and how to generate a complete CRUD slice for a new
database table. Follow it literally. The `users` resource is the reference
implementation — when in doubt, copy its patterns.

---

## 1. Architecture (read first)

Requests flow through four layers. **Never skip a layer.**

```
route handler (server/api/v{N}/<resource>/*)  → HTTP only
        ↓
service (server/services/<entity>.service.ts) → business rules, HTTP-agnostic, SHARED across versions
        ↓
repository (server/repositories/<entity>.repository.ts) → the ONLY layer that imports @nuxthub/db
        ↓
schema (server/db/schema/<entity>.ts)         → table definition, re-exported by server/db/schema.ts
```

### Hard rules (do not violate)
1. **Only repositories import `@nuxthub/db`.** Services and routes must never run Drizzle queries directly.
2. **Route handlers stay thin** — validate input, call a service, return a presented result. No business logic, no DB calls. Aim for under ~10 lines.
3. **Services never touch HTTP** — no `event`, no `setResponseStatus`, no `readBody`. They take plain arguments and return domain objects. They throw domain errors from `server/utils/errors.ts`.
4. **Version the edge, not the core.** Add versioned folders under `server/api/v{N}/` only. Services and repositories are shared across versions and are NOT versioned.
5. **Per-version differences = validation + response shape only.** Implemented via Zod schemas in `shared/schemas/v{N}/` and presenters in `server/utils/presenters/`. Business logic is identical across versions unless behavior genuinely diverges.
6. **Validation lives in `shared/`** so the client can import the same Zod schema.

---

## 2. Naming conventions

| Thing | Convention | Example (`info` table) |
|---|---|---|
| Schema file | `server/db/schema/<entity>.ts` | `schema/info.ts` |
| Table export | plural, camelCase | `info` (already plural-ish → keep as-is) |
| Row type | singular, PascalCase | `Info`, `NewInfo` |
| Repository | `server/repositories/<entity>.repository.ts` | `info.repository.ts` |
| Service | `server/services/<entity>.service.ts` | `info.service.ts` |
| Zod schema | `shared/schemas/v{N}/<entity>.schema.ts` | `shared/schemas/v1/info.schema.ts` |
| Presenter | `server/utils/presenters/<entity>.v{N}.ts` | `presenters/info.v1.ts` |
| Routes | `server/api/v{N}/<resource>/...` | `server/api/v1/info/...` |

`<entity>` = singular (`info`, `user`). `<resource>` = the URL segment (usually plural: `users`; for `info` keep `info`).

### Schema conventions (Postgres / `drizzle-orm/pg-core`)
This project uses **PostgreSQL**. When defining a table, import from
`drizzle-orm/pg-core` (NOT `sqlite-core`):
- Primary key: `id: serial('id').primaryKey()`
- Text: `text('col')`; booleans: `boolean('col').notNull().default(false)`
- Timestamps: `timestamp('created_at', { withTimezone: true }).notNull().defaultNow()`
- Auto-touch on update: append `.$onUpdate(() => new Date())`
- Column names are written explicitly in snake_case (e.g. `'created_at'`).

Mirror `server/db/schema/user.ts` and `server/db/schema/info.ts` exactly.

---

## 3. Files to create for a new resource

Given an already-defined table file `server/db/schema/<entity>.ts`, create these
**six** items (plus one edit):

1. **Edit** `server/db/schema.ts` → add `export * from './schema/<entity>'` (skip if already present).
2. `server/repositories/<entity>.repository.ts`
3. `server/services/<entity>.service.ts`
4. `shared/schemas/v1/<entity>.schema.ts`
5. `server/utils/presenters/<entity>.v1.ts`
6. Route handlers under `server/api/v1/<resource>/`:
   - `index.get.ts` (list)
   - `index.post.ts` (create)
   - `[id].get.ts` (read one)
   - `[id].patch.ts` (update)
   - `[id].delete.ts` (delete)

---

## 4. Templates

Replace `<Entity>` / `<entity>` / `<entities>` / `<resource>` and the fields to
match the table. Mirror `users` for anything not shown.

### 4a. Repository — `server/repositories/<entity>.repository.ts`
```ts
import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import type { New<Entity>, <Entity> } from '../db/schema'

export const <entity>Repository = {
  findAll(): Promise<<Entity>[]> {
    return db.query.<entities>.findMany({
      orderBy: (t, { desc }) => [desc(t.createdAt)],
    })
  },
  findById(id: number): Promise<<Entity> | undefined> {
    return db.query.<entities>.findFirst({ where: eq(schema.<entities>.id, id) })
  },
  async create(data: New<Entity>): Promise<<Entity>> {
    const [row] = await db.insert(schema.<entities>).values(data).returning()
    return row
  },
  async update(id: number, data: Partial<New<Entity>>): Promise<<Entity> | undefined> {
    const [row] = await db.update(schema.<entities>).set(data)
      .where(eq(schema.<entities>.id, id)).returning()
    return row
  },
  async delete(id: number): Promise<boolean> {
    const rows = await db.delete(schema.<entities>)
      .where(eq(schema.<entities>.id, id)).returning({ id: schema.<entities>.id })
    return rows.length > 0
  },
}
```

### 4b. Service — `server/services/<entity>.service.ts`
```ts
import { <entity>Repository } from '../repositories/<entity>.repository'
import { notFound } from '../utils/errors'

export const <entity>Service = {
  list() {
    return <entity>Repository.findAll()
  },
  async getById(id: number) {
    const row = await <entity>Repository.findById(id)
    if (!row) throw notFound('<Entity>')
    return row
  },
  create(input: New<Entity>) {
    // Add business rules here (uniqueness, ownership, etc.) before persisting.
    return <entity>Repository.create(input)
  },
  async update(id: number, input: Partial<New<Entity>>) {
    await this.getById(id) // 404 if missing
    return <entity>Repository.update(id, input)
  },
  async remove(id: number) {
    const ok = await <entity>Repository.delete(id)
    if (!ok) throw notFound('<Entity>')
  },
}
```
> If a field must be unique, add a `findByX` to the repository and check it here,
> throwing `conflict(...)` — see `userService.register`.

### 4c. Zod schemas — `shared/schemas/v1/<entity>.schema.ts`
```ts
import { z } from 'zod'

export const create<Entity>V1Schema = z.object({
  // one line per user-writable field; never include id/createdAt/updatedAt
})

export const update<Entity>V1Schema = create<Entity>V1Schema.partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Provide at least one field' })

export type Create<Entity>V1 = z.infer<typeof create<Entity>V1Schema>
export type Update<Entity>V1 = z.infer<typeof update<Entity>V1Schema>
```

### 4d. Presenter — `server/utils/presenters/<entity>.v1.ts`
```ts
import type { <Entity> } from '../../db/schema'

export function present<Entity>V1(row: <Entity>) {
  return {
    id: row.id,
    // expose fields in the v1 contract; convert dates as needed
    created_at: row.createdAt.getTime(),
  }
}

export function present<Entity>ListV1(rows: <Entity>[]) {
  return rows.map(present<Entity>V1)
}
```

### 4e. Routes — `server/api/v1/<resource>/`

`index.get.ts`
```ts
import { <entity>Service } from '../../../services/<entity>.service'
import { present<Entity>ListV1 } from '../../../utils/presenters/<entity>.v1'

export default defineEventHandler(async () => {
  return present<Entity>ListV1(await <entity>Service.list())
})
```

`index.post.ts`
```ts
import { create<Entity>V1Schema } from '~~/shared/schemas/v1/<entity>.schema'
import { <entity>Service } from '../../../services/<entity>.service'
import { present<Entity>V1 } from '../../../utils/presenters/<entity>.v1'

export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, create<Entity>V1Schema.parse)
  const row = await <entity>Service.create(body)
  setResponseStatus(event, 201)
  return present<Entity>V1(row)
})
```

`[id].get.ts`
```ts
import { z } from 'zod'
import { <entity>Service } from '../../../services/<entity>.service'
import { present<Entity>V1 } from '../../../utils/presenters/<entity>.v1'

const paramsSchema = z.object({ id: z.coerce.number().int().positive() })

export default defineEventHandler(async (event) => {
  const { id } = await getValidatedRouterParams(event, paramsSchema.parse)
  return present<Entity>V1(await <entity>Service.getById(id))
})
```

`[id].patch.ts`
```ts
import { z } from 'zod'
import { update<Entity>V1Schema } from '~~/shared/schemas/v1/<entity>.schema'
import { <entity>Service } from '../../../services/<entity>.service'
import { present<Entity>V1 } from '../../../utils/presenters/<entity>.v1'

const paramsSchema = z.object({ id: z.coerce.number().int().positive() })

export default defineEventHandler(async (event) => {
  const { id } = await getValidatedRouterParams(event, paramsSchema.parse)
  const body = await readValidatedBody(event, update<Entity>V1Schema.parse)
  return present<Entity>V1((await <entity>Service.update(id, body))!)
})
```

`[id].delete.ts`
```ts
import { z } from 'zod'
import { <entity>Service } from '../../../services/<entity>.service'

const paramsSchema = z.object({ id: z.coerce.number().int().positive() })

export default defineEventHandler(async (event) => {
  const { id } = await getValidatedRouterParams(event, paramsSchema.parse)
  await <entity>Service.remove(id)
  setResponseStatus(event, 204)
  return null
})
```

---

## 5. NuxtHub gotchas (do NOT do these)
- **Do not** create or edit `drizzle.config.ts` — NuxtHub generates it.
- **Do not** add `@nuxthub/db` to `package.json` — it is auto-generated from the schema on `nuxt dev` / `nuxt build`.
- **Do not** define a table anywhere except `server/db/schema/<entity>.ts`, and always re-export it from the `server/db/schema.ts` barrel.
- **Do not** import `@nuxthub/db` outside the repository layer.
- Use `import.meta` / Nitro auto-imports (`defineEventHandler`, `readValidatedBody`, `getValidatedRouterParams`, `createError`, `setResponseStatus`) — they don't need importing in `server/`.

---

## 6. Definition of done (verify before finishing)
- [ ] Table re-exported from `server/db/schema.ts`.
- [ ] Repository created; it is the only new file importing `@nuxthub/db`.
- [ ] Service created; contains zero HTTP references; throws `notFound`/`conflict`.
- [ ] Zod create + update schemas in `shared/schemas/v1/`.
- [ ] v1 presenter created.
- [ ] All five route handlers created and each is thin (validate → service → present).
- [ ] No business logic in handlers; no DB calls outside the repository.
- [ ] `npx nuxt typecheck` passes (or report the errors).
- [ ] Migration generated: `npm run db:generate`.

---

## 7. Copy-paste prompt for the agent

> You are working in a Nuxt 4 + NuxtHub project. Read `AGENTS.md` and follow it
> exactly. Generate the complete **v1 CRUD slice** for the table defined in
> `server/db/schema/info.ts`, using the `users` resource as the reference
> implementation. Create the repository, service, Zod schemas (`shared/schemas/v1/`),
> v1 presenter, and all five route handlers under `server/api/v1/info/`. Add the
> barrel re-export if missing. Keep handlers thin, keep all Drizzle queries in the
> repository, and keep the service HTTP-agnostic. Then run `npx nuxt typecheck`
> and `npm run db:generate`, and list every file you created or changed.

Swap `info` / `server/db/schema/info.ts` for any future table to scaffold its CRUD.
