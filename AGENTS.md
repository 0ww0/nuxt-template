# AGENTS.md — How to add a CRUD resource to this project

This file tells an AI agent exactly how this codebase is structured and how to
generate a complete CRUD slice for a new database table. Follow it literally.
The `users` resource is the reference implementation — when in doubt, copy its patterns.

> **Data-layer work?** Use the database skill at `.claude/skills/database/SKILL.md`.
>
> **Singleton resource, or endpoint patterns in depth?**
> See the api skill at `.claude/skills/api/SKILL.md`. Five singletons already exist
> (`info`, `seo`, `analytics`, `general`, `contact`) — mirror any of them.
>
> **Auth, roles, abuse, or account flows?** Logged-in/owned resources → auth skill;
> role-gating → rbac skill; throttling → rate-limit skill; reset/verify/MFA →
> account-security skill (all in `.claude/skills/`).
>
> **Webhook handlers?** They live under `server/api/v1/webhooks/`, are
> CSRF-exempt, and MUST call `requireWebhookSignature(event)` as their first
> line. See `server/utils/webhook.ts` and `server/middleware/csrf.ts`.
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
1. **Only repositories import `@nuxthub/db`.** Services and routes never run Drizzle directly. (Sole exception: scheduled maintenance tasks in `server/tasks/` — see `server/tasks/auth/cleanup.ts` — may import it; not a precedent for routes/services.)
2. **Route handlers stay thin** — validate input, call a service, return a presented result. No business logic, no DB calls. Aim for ~10 lines or fewer.
3. **Services never touch HTTP** — no `event`, no `setResponseStatus`, no `readBody`. They take plain arguments and return domain objects. They throw domain errors from `server/utils/errors.ts`.
4. **Version the edge, not the core.** Add versioned folders under `server/api/v{N}/` only. Services and repositories are shared across versions and are NOT versioned.
5. **Per-version differences = validation + response shape only.** Implemented via Zod schemas in `shared/schemas/v{N}/` and presenters in `server/utils/presenters/`. Business logic is identical across versions unless behavior genuinely diverges.
6. **Validation lives in `shared/`** so the client can import the same Zod schema.

---

### Auth-aware resources

If a resource is owned or must be logged-in-only, do NOT add session logic to
the service. In the handler, resolve the user at the edge and pass it down:

1. Call `const user = await requireUser(event)` (auto-401 if absent), then pass `user.id` as an explicit argument to the service — e.g. `postService.create(user.id, body)`.
2. For role-gated resources: `const actor = await requireMinRole(event, 'admin')` (auto-403 below that rank).
3. For **role mutation or deletion** — pass the full `actor` object to the service so it can enforce rank rules (no self-change, can't assign above your rank, can't delete a peer or superior). See `userService.setRole(actor, id, role)` and `userService.remove(actor, id)`.
4. When creating a user with a specified role, also call `assertCanAssignRole(actor, role)` from `server/utils/auth.ts` to cap the assignable role at the actor's own rank.
5. Keep the service signature actor-explicit (`create(ownerId, input)`) so the tenancy layer can later swap `user.id` for the active `tenantId` without touching callers.
6. Any table holding a secret (e.g. `passwordHash`, `tokenHash`, `codeHash`) must use a hand-listed presenter that OMITS the secret — never spread-everything.

Full recipe (register/login/logout/me, hashing, errors): see the **auth skill**.
Role-gating: **rbac skill** (also covers `assertCanAssignRole` and `requireVerifiedUser`).
Abuse-prone endpoints: **rate-limit skill**.
Reset/verify/MFA: **account-security skill**.

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

> **Reference resources:** `users` is the **collection** example (many rows, full CRUD).
> Any of the five settings singletons is the **singleton** example (one row pinned
> to `id = 1`, `GET` public + `POST`/`PATCH` upsert, no `[id]` routes — follow
> the api skill §2). Don't re-scaffold any of these.

## 3. Schema

```ts
// server/db/schema/<entity>.ts
import { pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core'

export const <entities> = pgTable('<entities>', {
  id:        serial('id').primaryKey(),
  name:      text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
             .$onUpdate(() => new Date()),
})

export type <Entity>    = typeof <entities>.$inferSelect
export type New<Entity> = typeof <entities>.$inferInsert
```

Add one line to the barrel (`server/db/schema.ts`): `export * from './schema/<entity>'`

Run `npm run db:generate` to create the migration.

## 4. Files to create (collection resource)

### Repository
```ts
// server/repositories/<entity>.repository.ts
import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import type { <Entity>, New<Entity> } from '../db/schema'

export const <entity>Repository = {
  findAll(): Promise<<Entity>[]> {
    return db.query.<entities>.findMany({ orderBy: (t, { desc }) => [desc(t.createdAt)] })
  },
  findById(id: number): Promise<<Entity> | undefined> {
    return db.query.<entities>.findFirst({ where: eq(schema.<entities>.id, id) })
  },
  async create(data: New<Entity>): Promise<<Entity>> {
    const [row] = await db.insert(schema.<entities>).values(data).returning()
    return row!
  },
  async update(id: number, data: Partial<New<Entity>>): Promise<<Entity> | undefined> {
    const [row] = await db.update(schema.<entities>).set(data)
      .where(eq(schema.<entities>.id, id)).returning()
    return row
  },
  async delete(id: number): Promise<boolean> {
    const deleted = await db.delete(schema.<entities>)
      .where(eq(schema.<entities>.id, id)).returning({ id: schema.<entities>.id })
    return deleted.length > 0
  },
}
```

### Service
```ts
// server/services/<entity>.service.ts
import { <entity>Repository } from '../repositories/<entity>.repository'
import { notFound } from '../utils/errors'
import type { New<Entity> } from '../db/schema'

export const <entity>Service = {
  list()                      { return <entity>Repository.findAll() },
  async getById(id: number)   {
    const row = await <entity>Repository.findById(id)
    if (!row) throw notFound('<Entity>')
    return row
  },
  create(data: New<Entity>)   { return <entity>Repository.create(data) },
  async update(id: number, data: Partial<New<Entity>>) {
    await this.getById(id)
    return <entity>Repository.update(id, data)
  },
  async remove(id: number) {
    await this.getById(id)
    await <entity>Repository.delete(id)
  },
}
```

### Zod schemas
```ts
// shared/schemas/v1/<entity>.schema.ts
import { z } from 'zod'

export const create<Entity>V1Schema = z.object({
  name: z.string().min(1).max(120),
})

export const update<Entity>V1Schema = create<Entity>V1Schema
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'Provide at least one field' })

export type Create<Entity>V1 = z.infer<typeof create<Entity>V1Schema>
export type Update<Entity>V1 = z.infer<typeof update<Entity>V1Schema>
```

### Presenter
```ts
// server/utils/presenters/<entity>.v1.ts
import type { <Entity> } from '../../db/schema'

export function present<Entity>V1(row: <Entity>) {
  return {
    id:         row.id,
    name:       row.name,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  }
}

export function present<Entity>ListV1(rows: <Entity>[]) {
  return rows.map(present<Entity>V1)
}
```

### Route handlers

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
  setResponseStatus(event, 201)
  return present<Entity>V1(await <entity>Service.create(body))
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
  const body   = await readValidatedBody(event, update<Entity>V1Schema.parse)
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
- **Do not** add `@nuxthub/db` to `package.json` — it is auto-generated from the schema.
- **Do not** define a table anywhere except `server/db/schema/<entity>.ts`; always re-export from the barrel.
- **Do not** import `@nuxthub/db` outside the repository layer.
- Use Nitro auto-imports (`defineEventHandler`, `readValidatedBody`, `getValidatedRouterParams`, `createError`, `setResponseStatus`) — they don't need importing in `server/`.

### TypeScript gotcha (`noUncheckedIndexedAccess`)
`const [row] = await db…returning()` is `T | undefined`.
- Always-one-row ops (`create`, `upsert`): `return row!` with non-optional return type.
- May-be-missing ops (`findById`, `update` by arbitrary id): keep `| undefined`.
- When caller knows row exists (after a guard): `present<Entity>V1((await service.update(id, b))!)`.

---

## 6. Definition of done
- [ ] Table re-exported from `server/db/schema.ts`.
- [ ] Repository created; it is the only new file importing `@nuxthub/db`.
- [ ] Service created; contains zero HTTP references; throws `notFound`/`conflict`.
- [ ] Zod create + update schemas in `shared/schemas/v1/`; update schema uses `.partial().strict().refine(...)`.
- [ ] v1 presenter created; no secret columns exposed.
- [ ] All five route handlers created and each is thin (validate → service → present, ~10 lines).
- [ ] No business logic in handlers; no DB calls outside the repository.
- [ ] `npx nuxt typecheck` passes (or report the errors).
- [ ] Migration generated: `npm run db:generate`.

---

## 7. Scaffolding a new resource

Preferred: invoke the **resource-scaffolder** agent (`.claude/agents/resource-scaffolder.md`).

Manual prompt:

> Read `AGENTS.md` and follow it exactly. Generate the complete **v1 CRUD slice**
> for `<entity>` (table at `server/db/schema/<entity>.ts`), using the `users`
> resource as the reference. Create the repository, service, Zod schemas
> (`shared/schemas/v1/`), v1 presenter, and all route handlers under
> `server/api/v1/<entity>/`. Add the barrel re-export if missing. Keep handlers
> thin, all Drizzle in the repository, the service HTTP-agnostic. Then run
> `npx nuxt typecheck` and `npm run db:generate`, and list every file changed.

For a **singleton** (one config row, `GET` public + `POST`/`PATCH` upsert), follow
the api skill §2 instead. Don't re-scaffold any of the five existing singletons.
