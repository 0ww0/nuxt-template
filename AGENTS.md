# AGENTS.md — How to add a CRUD resource to this project

This file tells an AI agent (Claude Code, Cursor, etc.) **exactly** how this
codebase is structured and how to generate a complete CRUD slice for a new
database table. Follow it literally. The `users` resource is the reference
implementation — when in doubt, copy its patterns.

> **Data-layer work?** For schema/column changes, migrations, seeding, query
> authoring, or dev-db operations, use the database skill at
> `.claude/skills/database/SKILL.md` instead. This file is for building the
> upper layers (service + presenter + versioned routes) of a CRUD slice.
>
> **Singleton resource, or endpoint patterns/validation/versioning in depth?**
> See the API skill at `.claude/skills/api/SKILL.md`. This file covers the
> standard *collection* resource (many rows); the API skill covers the
> *singleton* pattern (one row, get + upsert) and all endpoint conventions.
>
> **Auth, roles, abuse, or account flows?** Logged-in/owned resources → auth skill;
> role-gating → rbac skill; throttling → rate-limit skill; reset/verify/MFA →
> account-security skill (all in `.claude/skills/`).
>
> **Want it scaffolded or reviewed?** Use the `resource-scaffolder` and
> `convention-reviewer` agents in `.claude/agents/`.

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
1. **Only repositories import `@nuxthub/db`.** Services and routes never run Drizzle directly. (Sole exception: scheduled maintenance tasks in `server/tasks/` — see
`server/tasks/auth/cleanup.ts` — may import it; not a precedent for routes/services.)
2. **Route handlers stay thin** — validate input, call a service, return a presented result. No business logic, no DB calls. Aim for under ~10 lines.
3. **Services never touch HTTP** — no `event`, no `setResponseStatus`, no `readBody`. They take plain arguments and return domain objects. They throw domain errors from `server/utils/errors.ts`.
4. **Version the edge, not the core.** Add versioned folders under `server/api/v{N}/` only. Services and repositories are shared across versions and are NOT versioned.
5. **Per-version differences = validation + response shape only.** Implemented via Zod schemas in `shared/schemas/v{N}/` and presenters in `server/utils/presenters/`. Business logic is identical across versions unless behavior genuinely diverges.
6. **Validation lives in `shared/`** so the client can import the same Zod schema.

---

### Auth-aware resources

If a resource is owned or must be logged-in-only, do NOT add session logic to
the service (that would make it touch HTTP). Instead:

1. In the handler, call `const user = await requireUser(event)` first (auto-401 if
   absent), then pass `user.id` as an explicit argument to the service — e.g.
   `postService.create(user.id, body)`. For a role-gated resource, use
   `await requireMinRole(event, 'admin')` instead (auto-403 below that rank).
2. Keep the service signature actor-explicit (`create(ownerId, input)`) so the
   tenancy layer can later swap `user.id` for the active `tenantId` without
   touching callers.
3. Any table holding a secret (e.g. `passwordHash`, `tokenHash`, `codeHash`, or a
   raw token) must use a hand-listed presenter that OMITS the secret — never
   spread-everything.

Full recipe (register/login/logout/me, hashing, errors): see the **auth skill**
at `.claude/skills/auth/SKILL.md`.

For role-gating use `requireMinRole`/`requireRole` (rbac skill); for abuse-prone
endpoints add `checkRateLimit` (rate-limit skill); for reset/verify/MFA, follow the
account-security skill rather than reinventing the hashed-one-time-secret pattern.

## 2. Naming conventions

| Thing | Convention | Example (`project` table) |
|---|---|---|
| Schema file | `server/db/schema/<entity>.ts` | `schema/project.ts` |
| Table export | plural, camelCase | `projects` |
| Row type | singular, PascalCase | `Project`, `NewProject` |
| Repository | `server/repositories/<entity>.repository.ts` | `project.repository.ts` |
| Service | `server/services/<entity>.service.ts` | `project.service.ts` |
| Zod schema | `shared/schemas/v{N}/<entity>.schema.ts` | `shared/schemas/v1/project.schema.ts` |
| Presenter | `server/utils/presenters/<entity>.v{N}.ts` | `presenters/project.v1.ts` |
| Routes | `server/api/v{N}/<resource>/...` | `server/api/v1/projects/...` |

`<entity>` = singular (`project`, `user`). `<resource>` = the URL segment (usually
plural: `projects`, `users`). When a noun is already plural-ish, keep it as-is.

> The two reference resources: `users` is the **collection** example (many rows,
> full CRUD — copy it for the playbook below). `infos` (DB table `informations`,
> exported as `infos`) is the **singleton** example (one row pinned to `id = 1`,
> get + upsert, no `[id]` routes — follow the api skill §2, not this file). Don't
> re-scaffold either.

### Schema conventions (Postgres / `drizzle-orm/pg-core`)
This project uses **PostgreSQL**. When defining a table, import from
`drizzle-orm/pg-core` (NOT `sqlite-core`):
- Primary key: `id: serial('id').primaryKey()`
- Text: `text('col')`; booleans: `boolean('col').notNull().default(false)`
- Timestamps: `timestamp('created_at', { withTimezone: true }).notNull().defaultNow()`
- Auto-touch on update: append `.$onUpdate(() => new Date())`
- Column names: `hub.db.casing` is `'snake_case'`, so you may OMIT the
  column-name string and let camelCase keys map to snake_case columns
  (e.g. `ogImage: text()` → `og_image`). Explicit names still work and override.
  `users` uses explicit names; `infos` uses the no-name style — both are valid.

Mirror `server/db/schema/user.ts` (collection) and `server/db/schema/info.ts`
(singleton) for the two shapes.

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
    return row! // INSERT...RETURNING always yields one row (see TS note below)
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

// PATCH: .partial() (every field optional) + .strict() (REJECT unknown keys, so a
// caller can't mass-assign id/createdAt/updatedAt/role) + .refine() (require ≥1 field).
// The .strict() is mandatory — omitting it reopens mass-assignment. See the api skill.
export const update<Entity>V1Schema = create<Entity>V1Schema.partial().strict()
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
    // expose fields in the v1 contract; convert dates as needed.
    // NEVER expose a secret column (passwordHash/tokenHash/codeHash/raw tokens).
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

### TypeScript gotcha (this project has `noUncheckedIndexedAccess`)
`const [row] = await db…returning()` is typed `T | undefined`. So:
- Methods that ALWAYS return one row (`create`, `upsert`): `return row!` and
  declare a non-optional return type (`Promise<<Entity>>`).
- Methods that MAY find nothing (`findById`, `update` by arbitrary id): keep the
  return type `Promise<<Entity> | undefined>` and return `row` as-is.
- At the route, when you know the row exists (e.g. after a `getById` guard),
  assert at the call site: `present<Entity>V1((await service.update(id, b))!)`.

---

## 6. Definition of done (verify before finishing)
- [ ] Table re-exported from `server/db/schema.ts`.
- [ ] Repository created; it is the only new file importing `@nuxthub/db`.
- [ ] Service created; contains zero HTTP references; throws `notFound`/`conflict`.
- [ ] Zod create + update schemas in `shared/schemas/v1/`; the update schema uses
      `.partial().strict().refine(...)` (`.strict()` present).
- [ ] v1 presenter created; no secret columns exposed.
- [ ] All five route handlers created and each is thin (validate → service → present).
- [ ] No business logic in handlers; no DB calls outside the repository.
- [ ] `npx nuxt typecheck` passes (or report the errors).
- [ ] Migration generated: `npm run db:generate`.

---

## 7. Scaffolding a new resource

Preferred: invoke the **resource-scaffolder** agent
(`.claude/agents/resource-scaffolder.md`) — it follows this file plus the
api/database skills, generates the slice, and typechecks.

To drive any agent manually, paste:

> Read `AGENTS.md` and follow it exactly. Generate the complete **v1 CRUD slice**
> for `<entity>` (table at `server/db/schema/<entity>.ts`), using the `users`
> resource as the reference. Create the repository, service, Zod schemas
> (`shared/schemas/v1/`), v1 presenter, and all route handlers under
> `server/api/v1/<entity>/`. Add the barrel re-export if missing. Keep handlers
> thin, all Drizzle in the repository, the service HTTP-agnostic. Then run
> `npx nuxt typecheck` and `npm run db:generate`, and list every file changed.

For a **singleton** (one config row, get + upsert — like `infos`), follow the api
skill §2 instead of the five-route shape. `users` (collection) and `infos`
(singleton) are the two **reference** implementations — don't re-scaffold them.
