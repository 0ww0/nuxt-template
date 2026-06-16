---
name: database
description: Handles all database work in this Nuxt 4 + NuxtHub + Drizzle (PostgreSQL) project. Use this skill whenever the task touches the data layer — adding or altering a table or column, generating or applying migrations, seeding dev data, writing or optimizing Drizzle queries and repository methods (filters, pagination, joins/relations, transactions, upserts), managing the local Postgres container, or troubleshooting connection/migration errors. Trigger this even when the user phrases it casually ("add a field", "the query is slow", "reset my db", "why won't it connect") and does not say the word "database". For building a full CRUD slice (routes + service + repository) prefer AGENTS.md; for anything that lives at or below the repository/schema/migration level, use THIS skill.
---

# Database Skill — NuxtHub + Drizzle + PostgreSQL

This project's data layer. Use it to make safe, convention-correct changes to
the schema, migrations, queries, and dev database.

## Stack & invariants (never violate)

- **PostgreSQL** via Drizzle ORM. Schema tables use `drizzle-orm/pg-core`.
- **Split schema**: one table per file in `server/db/schema/<entity>.ts`;
  `server/db/schema.ts` is a barrel that `export *`s every table. NuxtHub reads
  the barrel to generate the `@nuxthub/db` client.
- **Only the repository layer imports `@nuxthub/db`.** Services and route
  handlers must never run queries. If a query is needed, add a method to the
  relevant `server/repositories/<entity>.repository.ts`.
  (`hub:db` is a legacy Nuxt-only alias for the same client; this project
  standardizes on `@nuxthub/db`.)
- **NuxtHub config** (`nuxt.config.ts`): `hub.db.dialect = 'postgresql'`,
  `hub.db.casing = 'snake_case'` (camelCase keys → snake_case columns, so
  column-name strings are optional), connection from `process.env.DATABASE_URL`.
- **Never** create/edit `drizzle.config.ts` (NuxtHub generates it) or add
  `@nuxthub/db` to `package.json` (auto-generated from the schema).

## Pick your task

1. Add a new table → §1
2. Add / change / drop a column → §2
3. Generate & apply migrations → §3
4. Seed dev data → §4
5. Write a query / add a repository method → §5 (cookbook)
6. Manage the local Postgres container → §6
7. Something is broken → §7 (troubleshooting)

---

## §1 Add a new table

1. Create `server/db/schema/<entity>.ts` using `pg-core`. Mirror
   `server/db/schema/user.ts`:
   ```ts
   import { pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core'

   export const <entities> = pgTable('<entities>', {
     id: serial('id').primaryKey(),
     // columns…
     createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
   })

   export type <Entity> = typeof <entities>.$inferSelect
   export type New<Entity> = typeof <entities>.$inferInsert
   ```
2. Add one line to the barrel `server/db/schema.ts`:
   `export * from './schema/<entity>'`
3. Generate + apply the migration (§3).
4. If the table needs CRUD endpoints, hand off to **AGENTS.md** §3.

### Column type quick reference (pg-core)
| Need | Use |
|---|---|
| Auto-increment PK | `serial('id').primaryKey()` |
| Text | `text('col')` / `varchar('col', { length: 255 })` |
| Integer / number | `integer('col')` / `numeric('col', { precision, scale })` |
| Boolean | `boolean('col').notNull().default(false)` |
| Timestamp | `timestamp('col', { withTimezone: true }).notNull().defaultNow()` |
| Auto-touch on update | add `.$onUpdate(() => new Date())` |
| JSON | `jsonb('col').$type<MyType>()` |
| Enum | `pgEnum('name', ['a','b'])` then `myEnum('col')` |
| Foreign key | `integer('user_id').references(() => users.id)` |
| Unique | `.unique()` on the column |

---

## §2 Add / change / drop a column

1. Edit the table file in `server/db/schema/<entity>.ts`.
2. Adding a **NOT NULL** column to a table with existing rows will fail unless
   you provide `.default(...)` or backfill. For dev, add a default or accept a
   wipe (§6 reset).
3. Renames: Drizzle sees a drop+add by default. `drizzle-kit generate` will
   prompt whether a change is a rename — answer carefully to avoid data loss.
4. Generate + apply (§3). Re-check any `presenter` and `shared/schemas/*` that
   reference the changed field, and the `Partial<New<Entity>>` used in updates.

---

## §3 Migrations

Workflow for this project:

```bash
npm run db:generate     # nuxt db generate → writes SQL to server/db/migrations/
npm run dev             # dev server AUTO-APPLIES pending migrations
```

- Generated SQL files live in `server/db/migrations/`. Commit them.
- The dev server applies pending migrations automatically on start.
- For deploys / CI: `npm run db:migrate` (`nuxt db migrate`).
- Other useful commands: `npx nuxt db sql "SELECT …"`, `npx nuxt db drop <TABLE>`,
  `npx nuxt db mark-as-migrated <NAME>`.
- Inspect applied migrations in the `_hub_migrations` table.
- Never hand-edit a migration that has already been applied to a shared db;
  create a new one instead. Editing un-applied dev migrations is fine.

---

## §4 Seed dev data

Seeding must run in the Nitro context (where `@nuxthub/db` exists). This project
ships a dev-only route at `server/api/dev/seed.post.ts`:

```bash
npm run dev
curl -X POST http://localhost:3000/api/dev/seed
```

It is guarded by `import.meta.dev` and 403s in production. To seed a new table,
add inserts there following the existing pattern. (A Nitro task under
`server/tasks/` is an alternative if you prefer `nuxt task run`.)

---

## §5 Query cookbook — add a repository method

All queries live in `server/repositories/<entity>.repository.ts`. Import
operators from `drizzle-orm`. Two query styles exist: the **relational** builder
(`db.query.x`) for reads with relations, and the **core** builder (`db.select`)
for fine control.

```ts
import { db, schema } from '@nuxthub/db'
import { and, or, eq, ilike, gt, desc, asc, sql } from 'drizzle-orm'
```

**Filtered list**
```ts
db.query.users.findMany({
  where: and(ilike(schema.users.name, `%${q}%`), gt(schema.users.id, 0)),
  orderBy: (u, { desc }) => [desc(u.createdAt)],
})
```

**Pagination** (page is 1-based)
```ts
const pageSize = 20
db.query.users.findMany({ limit: pageSize, offset: (page - 1) * pageSize })
```

**Count** (Drizzle 0.36+)
```ts
const total = await db.$count(schema.users)                 // all
const active = await db.$count(schema.users, eq(schema.users.active, true))
```

**Insert / update / delete** (always `.returning()` to get the row back)
```ts
const [row]    = await db.insert(schema.users).values(data).returning()
const [updated]= await db.update(schema.users).set(patch)
  .where(eq(schema.users.id, id)).returning()
const deleted  = await db.delete(schema.users)
  .where(eq(schema.users.id, id)).returning({ id: schema.users.id })
```
> `noUncheckedIndexedAccess` is on: `row`/`updated` are `T | undefined`. For
> always-one-row ops (insert/upsert) return `row!`; for maybe-missing ops keep
> the `| undefined`. See the API skill §3.

**Upsert**
```ts
await db.insert(schema.users).values(data)
  .onConflictDoUpdate({ target: schema.users.email, set: { name: data.name } })
```

**Transaction** (all-or-nothing)
```ts
await db.transaction(async (tx) => {
  const [u] = await tx.insert(schema.users).values(data).returning()
  await tx.insert(schema.info).values({ title: 'hi', content: `user ${u.id}` })
})
```

**Joins / relations**: `db.query.x.findMany({ with: { … } })` requires you to
define `relations()` in the schema (see Drizzle relations docs). Without
relations, use an explicit join:
```ts
db.select({ user: schema.users, info: schema.info })
  .from(schema.users)
  .leftJoin(schema.info, eq(schema.info.id, schema.users.id))
```

Keep raw SQL (`sql\`…\``) to a minimum and only inside the repository.

---

## §6 Local Postgres container

`docker-compose.yml` runs Postgres using the `POSTGRES_*` vars from `.env`.

```bash
docker compose up -d        # start
docker compose ps           # status
docker compose stop         # stop (keeps data)
docker compose down         # stop + remove container (keeps named volume)
docker compose down -v      # NUKE data (fresh db) — dev only
docker compose exec db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"   # psql shell
```

**Full reset** (schema drift, corrupt local state): `docker compose down -v`
then `docker compose up -d`, then `npm run dev` to re-apply migrations, then
re-seed (§4).

---

## §7 Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| `ECONNREFUSED 127.0.0.1:5432` | Postgres not running → `docker compose up -d`; check port not taken. |
| `password authentication failed` | `.env` creds ≠ container creds. Match `DATABASE_URL` to `POSTGRES_*`, then `docker compose down -v && up -d`. |
| `database "nuxtdb" does not exist` | Volume predates the `POSTGRES_DB` value → `docker compose down -v && up -d`. |
| Migrations not applying | Confirm files exist in `server/db/migrations/`; run `npm run db:generate` then restart dev. Check `_hub_migrations`. |
| `relation "x" does not exist` | Migration not generated/applied for that table, or barrel missing the `export *` line. |
| NOT NULL add fails | Existing rows → add `.default(...)` or reset dev db (§6). |
| Wrong driver/dialect selected | `nuxt.config.ts` `hub.db.dialect` must be `postgresql`; `DATABASE_URL` must be a `postgresql://` URL. |
| Types out of date after schema edit | Re-run `npm run dev`/`nuxt prepare` to regenerate `@nuxthub/db`. |

---

## Relationship to AGENTS.md

- **AGENTS.md** = build a full vertical CRUD slice (schema → repository →
  service → presenter → versioned routes) for a resource.
- **API skill** (`.claude/skills/api/SKILL.md`) = the HTTP layer above the
  repository: endpoint conventions, the singleton pattern, validation,
  presenters, versioning, TS gotchas.
- **This skill** = everything at the data layer: schema/column changes,
  migrations, seeding, query authoring, and dev-db operations.

When a CRUD task also needs a new table, do §1 + §3 here first, then follow
AGENTS.md for the upper layers.
