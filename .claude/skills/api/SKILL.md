---
name: api
description: Handles the HTTP layer of this Nuxt 4 + NuxtHub project — adding or modifying any route handler, service, presenter, or input validation. Use it to choose between a COLLECTION resource (many rows: list/create/read/update/delete) and a SINGLETON resource (one config-style row: get + upsert), to write thin method-suffixed handlers, validate input with Zod (strict bodies, partial PATCH, coerced route params), shape responses with presenters, version endpoints, and handle errors and status codes. Also the reference for the TypeScript gotchas in this stack (noUncheckedIndexedAccess + RETURNING, upsert with NOT NULL columns). Trigger on casual phrasing too ("add an endpoint", "validate this body", "make a settings API", "why is row possibly undefined"). For tables/migrations/queries use the database skill; for scaffolding a whole collection CRUD at once, AGENTS.md has the end-to-end recipe.
---

# API Skill — endpoint & service patterns

The HTTP layer of this project. Sits above the repository. Use it to add or
change endpoints the right way.

## Layered flow (never skip a layer)

```
route handler (server/api/v{N}/<resource>/*.<method>.ts)  → HTTP only
        ↓
service (server/services/<entity>.service.ts)             → business rules, HTTP-agnostic, SHARED across versions
        ↓
repository (server/repositories/<entity>.repository.ts)   → the ONLY layer that imports @nuxthub/db
```

Hard rules: handlers are thin (validate → delegate → present, ~3–8 lines);
services never touch `event`/status codes and throw domain errors from
`server/utils/errors.ts`; only repositories run queries; version the edge, not
the core (services/repositories are shared across `v1`, `v2`, …).

## Step 0 — pick the resource shape

| | Collection | Singleton |
|---|---|---|
| Example | `users` | `informations` (app config) |
| Rows | many | exactly one (pinned `id = 1`) |
| Endpoints | list, create, read(:id), update(:id), delete(:id) | get, upsert |
| Reference | `users` slice + **AGENTS.md** | `info` slice + §2 below |

If it's a collection, follow **AGENTS.md** §3–4. If it's a singleton (settings,
site config, feature flags as one record), use §2 here.

---

## §1 Endpoint conventions (both shapes)

**Routing** — one file per HTTP method under `server/api/v{N}/<resource>/`:
`index.get.ts`, `index.post.ts`, `[id].get.ts`, `[id].patch.ts`,
`[id].delete.ts`. Nitro returns 405 automatically for unhandled methods — do
NOT write a method switch or a 405 branch.

**Validation (Zod, in `shared/schemas/v{N}/`)** — import the schema on both the
server and the client.
- Body: `await readValidatedBody(event, createXV1Schema.parse)`.
- Route params: `await getValidatedRouterParams(event, z.object({ id: z.coerce.number().int().positive() }).parse)`.
- PATCH bodies: `createSchema.partial().refine(v => Object.keys(v).length > 0, …)`.
- Add `.strict()` to update/patch object schemas to REJECT unknown keys — this
  blocks mass-assignment of `id`/`createdAt`/etc. through a spread into `.set()`.

**Presenters (`server/utils/presenters/<entity>.v{N}.ts`)** — define the response
contract and convert dates.
- Few fields → hand-list them (see `user.v1`).
- Many fields / "return the whole record" → spread and convert timestamps
  (see `info.v1`).
- SKIP a presenter only when the client controls the shape (e.g. a `?fields=`
  selector) — note it in the handler.

**Status codes** — create → `setResponseStatus(event, 201)`; delete → `204` and
`return null`. Reads/updates → default 200.

**Errors** — throw `notFound(x)` / `conflict(msg)` from `server/utils/errors.ts`
in the service; they produce proper H3 errors so handlers stay clean.

**Versioning** — only `server/api/v{N}/` folders are versioned. A new version
usually means a new presenter + (maybe) a new Zod schema, calling the SAME
service. Freeze old versions when you ship a new one.

---

## §2 Singleton resource pattern

One logical row, pinned to a constant id. Get-or-create via an atomic upsert, so
there is no "seed first or 404" requirement on writes.

**Repository** (`server/repositories/<entity>.repository.ts`)
```ts
import { db, schema } from '@nuxthub/db'
import { eq } from 'drizzle-orm'
import type { <Entity>, New<Entity> } from '../db/schema'

const SINGLETON_ID = 1
// Defaults satisfy NOT NULL columns on first insert; applied on INSERT only.
const INSERT_DEFAULTS = { /* required cols, e.g. */ } satisfies Partial<New<Entity>>

export const <entity>Repository = {
  find() {
    return db.query.<entities>.findFirst({ where: eq(schema.<entities>.id, SINGLETON_ID) })
  },
  async upsert(data: Partial<New<Entity>>): Promise<<Entity>> {
    const [row] = await db
      .insert(schema.<entities>)
      .values({ id: SINGLETON_ID, ...INSERT_DEFAULTS, ...data } as New<Entity>)
      .onConflictDoUpdate({
        target: schema.<entities>.id,
        set: { ...data, updatedAt: new Date() }, // only provided fields; defaults NOT re-applied
      })
      .returning()
    return row! // upsert always writes exactly one row
  },
}
```

**Service**
```ts
export const <entity>Service = {
  async get() {
    const row = await <entity>Repository.find()
    if (!row) throw notFound('<Entity> (PATCH to create it)')
    return row
  },
  save(data: Partial<New<Entity>>) {
    return <entity>Repository.upsert(data) // creates on first write, updates after
  },
}
```

**Routes** — `index.get.ts` → `present(await service.get())`;
`index.patch.ts` and `index.post.ts` → validate then `present(await service.save(body))`.
No `[id]` routes — there is only one record.

**Seed** — pin the seeded row to the same `id` (`{ id: 1, … }`) so it shares the
singleton identity; otherwise an upsert targeting `id = 1` could create a second row.

Optional hardening: GET can get-or-create (return defaults instead of 404); a DB
`CHECK (id = 1)` guarantees only one row can ever exist.

---

## §3 TypeScript gotchas (this project sets `noUncheckedIndexedAccess`)

1. **`const [row] = await db…returning()` is `T | undefined`.**
   - Always-one-row methods (`create`, `upsert`) → `return row!` and declare a
     non-optional return type (`Promise<<Entity>>`).
   - May-be-missing methods (`findById`, `update` by arbitrary id) → keep
     `Promise<<Entity> | undefined>` and return `row` unasserted.
   - When the caller knows the row exists (after a `getById` guard), assert at the
     call site: `presentV1((await service.update(id, body))!)`.
   - If `@typescript-eslint/no-non-null-assertion` is on, replace `!` with an
     explicit `if (!row) throw createError({ statusCode: 500 })`.
2. **Upsert insert vs NOT NULL columns.** A partial first-write can omit required
   columns. Merge `INSERT_DEFAULTS` into `.values()` and cast `as New<Entity>`;
   keep the `set:` clause limited to `data` so defaults never overwrite real values.
3. **`db`/`schema` import** — standardize on `@nuxthub/db` (not the legacy
   `hub:db` alias), and only inside repositories.

---

## §4 Definition of done
- [ ] Resource shape chosen (collection → AGENTS.md; singleton → §2).
- [ ] Handlers thin; no business logic or DB calls in routes.
- [ ] Body validated with a `shared/schemas/v{N}` Zod schema; PATCH uses
      `.partial().strict().refine(...)`; params use `z.coerce`.
- [ ] Service is HTTP-agnostic and throws `notFound`/`conflict`.
- [ ] Presenter applied (or its absence justified).
- [ ] Correct status codes (201/204) and no manual 405.
- [ ] No `T | undefined` type errors (§3); `npx nuxt typecheck` passes.

## Relationship to the other docs
- **database skill** — schema, migrations, seeding, query authoring (the layer
  below this one).
- **AGENTS.md** — end-to-end recipe + templates for a full *collection* CRUD slice.
- **this skill** — endpoint conventions, the *singleton* pattern, validation,
  presenters, versioning, and the TS gotchas.
