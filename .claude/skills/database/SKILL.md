---
name: database
description: Handles all database work in this Nuxt 4 + NuxtHub + Drizzle (PostgreSQL) project. Use this skill whenever the task touches the data layer — adding or altering a table or column, generating or applying migrations, seeding dev data, writing or optimizing Drizzle queries and repository methods (filters, pagination, joins/relations, transactions, upserts), managing the local Postgres container, or troubleshooting connection/migration errors. Trigger this even when the user phrases it casually ("add a field", "the query is slow", "reset my db", "why won't it connect") and does not say the word "database". For building a full CRUD slice (routes + service + repository) prefer AGENTS.md; for anything that lives at or below the repository/schema/migration level, use THIS skill.
---

# Database Skill — NuxtHub + Drizzle + PostgreSQL

This project's data layer. Use it to make safe, convention-correct changes to the schema, migrations, queries, and dev database.

## Stack & invariants (never violate)

- **PostgreSQL** via Drizzle ORM. Schema tables use `drizzle-orm/pg-core`.
- **Split schema**: one table per file in `server/db/schema/`; `server/db/schema.ts` is a barrel that `export *`s every table. NuxtHub reads the barrel to generate the `@nuxthub/db` client.
- **Only the repository layer imports `@nuxthub/db`.** Services and route handlers must never run queries. (`hub:db` is a legacy alias; this project standardizes on `@nuxthub/db`.)
- **NuxtHub config** (`nuxt.config.ts`): `hub.db.dialect = 'postgresql'`, `hub.db.casing = 'snake_case'` (camelCase column keys → snake_case DB columns automatically — **column name strings are optional**), connection from `process.env.DATABASE_URL`.
- **Never** create/edit `drizzle.config.ts` (NuxtHub generates it) or add `@nuxthub/db` to `package.json` (auto-generated from the schema).

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

### Schema file naming

- **Collection tables** (many rows): `server/db/schema/<entity>.ts` — e.g. `user.ts`, `project.ts`.
- **Singleton tables** (one config row): `server/db/schema/<entity>Setting.ts` — e.g. `infoSetting.ts`, `seoSetting.ts`. The Drizzle export is plural camelCase (`infoSettings`); types are `<Entity>Setting` / `New<Entity>Setting`.

### Collection table template

```ts
// server/db/schema/<entity>.ts
import { pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core'

export const <entities> = pgTable('<entities>', {
  id:        serial().primaryKey(),
  name:      text().notNull(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow()
             .$onUpdate(() => new Date()),
})

export type <Entity>    = typeof <entities>.$inferSelect
export type New<Entity> = typeof <entities>.$inferInsert
```

> **Column strings are optional** — `hub.db.casing: 'snake_case'` maps camelCase keys to snake_case columns automatically. Omit the string arg (`serial()` not `serial('id')`) to keep the schema clean. Add it only when the column name must differ from the key.
>
> **Note on `user.ts`:** this file pre-dates the casing convention and still uses explicit column strings (`serial('id')`, `text('email')`, etc.). New tables should use the no-string style shown above. The `user.ts` file is a reference for *structure and type exports*, not for the column string style.

> **`updatedAt.$onUpdate`** — fires on Drizzle-initiated `UPDATE` only, not raw SQL. Always pair with `.defaultNow()` so the initial INSERT has a value.

### Singleton table template (mirror `server/db/schema/infoSetting.ts`)

```ts
// server/db/schema/<entity>Setting.ts
import { pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core'

export const <entity>Settings = pgTable('<entity>_settings', {
  id:          serial().primaryKey(),
  someField:   text(),
  createdAt:   timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt:   timestamp({ withTimezone: true }).notNull().defaultNow()
               .$onUpdate(() => new Date()),
})

export type <Entity>Setting    = typeof <entity>Settings.$inferSelect
export type New<Entity>Setting = typeof <entity>Settings.$inferInsert
```

After creating either file, add one line to the barrel `server/db/schema.ts`:
```ts
export * from './schema/<entity>[Setting]'
```

Then generate + apply the migration (§3).

### Column type quick reference (pg-core)

| Need | Use |
|---|---|
| Auto-increment PK | `serial().primaryKey()` |
| Text | `text()` / `varchar({ length: 255 })` |
| Integer | `integer()` |
| Boolean | `boolean().notNull().default(false)` |
| Timestamp | `timestamp({ withTimezone: true }).notNull().defaultNow()` |
| Auto-touch on update | add `.$onUpdate(() => new Date())` |
| JSON | `jsonb().$type<MyType>()` |
| Enum | `pgEnum('name', ['a','b'])` then `myEnum()` |
| Foreign key | `integer().references(() => users.id)` |
| Unique | `.unique()` on the column |
| CHECK constraint | `check('name', sql\`...\`)` in the table's second arg array |

---

## §2 Add / change / drop a column

1. Edit the table file in `server/db/schema/`.
2. Adding a **NOT NULL** column to a table with existing rows will fail unless you provide `.default(...)` or backfill first. For dev, add a default or reset (§6).
3. **Renames**: Drizzle sees a drop+add by default. `drizzle-kit generate` prompts whether a change is a rename — answer carefully to avoid data loss.
4. Generate + apply (§3). Re-check any presenter and `shared/schemas/*` that reference the changed field, and the `Partial<New<Entity>>` used in updates.

---

## §3 Migrations

```bash
npm run db:generate     # nuxt db generate → writes SQL to server/db/migrations/postgresql/
npm run dev             # dev server AUTO-APPLIES pending migrations on start
```

- Generated SQL files live in `server/db/migrations/`. Commit them.
- For deploys / CI: `npm run db:migrate` (`nuxt db migrate`).
- Other useful commands: `npx nuxt db sql "SELECT …"`, `npx nuxt db drop <TABLE>`, `npx nuxt db mark-as-migrated <NAME>`.
- Inspect applied migrations in the `_hub_migrations` table.
- Never hand-edit a migration that has already been applied to a shared db — create a new one instead.

---

## §4 Seed dev data

Seeding must run in the Nitro context (where `@nuxthub/db` exists). This project ships a dev-only route at `server/api/dev/seed.post.ts`:

```bash
npm run dev
curl -X POST http://localhost:3000/api/dev/seed
```

It is guarded by `import.meta.dev` and 403s in production.

**Singleton seed rows must use `id: 1`** — they must share the same PK the upsert repository is pinned to:

```ts
await db.insert(schema.infoSettings).values({ id: 1, title: 'My App', description: '...', version: '1.0.0' })
await db.insert(schema.seoSettings).values({ id: 1, keywords: '...', author: '...' })
// etc. for each singleton
```

**Collection seed rows** don't need a pinned id; let the serial PK auto-assign:

```ts
await db.insert(schema.users).values([{ email: '...', name: '...', passwordHash: '...' }])
```

---

## §5 Query cookbook — add a repository method

All queries live in `server/repositories/<entity>.repository.ts`. Import operators from `drizzle-orm`.

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
db.query.users.findMany({ limit: pageSize, offset: (page - 1) * pageSize })
```

**Count** (Drizzle 0.36+)
```ts
const total = await db.$count(schema.users)
const byRole = await db.$count(schema.users, eq(schema.users.role, 'admin'))
```

**Insert / update / delete** (always `.returning()` to get the row back)
```ts
const [row]     = await db.insert(schema.users).values(data).returning()
const [updated] = await db.update(schema.users).set(patch).where(eq(schema.users.id, id)).returning()
const deleted   = await db.delete(schema.users).where(eq(schema.users.id, id)).returning({ id: schema.users.id })
```

> `noUncheckedIndexedAccess` is on: `row`/`updated` are `T | undefined`. For always-one-row ops (insert/upsert) return `row!`; for maybe-missing ops keep `| undefined`. See the API skill §3.

**Upsert (singleton pattern)**
```ts
await db.insert(schema.infoSettings)
  .values({ id: 1, ...INSERT_DEFAULTS, ...data } as NewInfoSetting)
  .onConflictDoUpdate({
    target: schema.infoSettings.id,
    set: { ...data, updatedAt: new Date() },
  })
  .returning()
```

**Transaction** (all-or-nothing)
```ts
await db.transaction(async (tx) => {
  const [u] = await tx.insert(schema.users).values(data).returning()
  await tx.insert(schema.sessions).values({ userId: u!.id, token: '...', expiresAt: new Date() })
})
```

**Joins / relations**: `db.query.x.findMany({ with: { … } })` requires defining `relations()` in the schema. Without relations, use an explicit join:
```ts
db.select({ user: schema.users })
  .from(schema.users)
  .leftJoin(schema.sessions, eq(schema.sessions.userId, schema.users.id))
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
docker compose exec db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
```

**Full reset**: `docker compose down -v && docker compose up -d`, then `npm run dev` to re-apply migrations, then re-seed (§4).

---

## §7 Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| `ECONNREFUSED 127.0.0.1:5432` | Postgres not running → `docker compose up -d` |
| `password authentication failed` | `.env` creds ≠ container creds. Match `DATABASE_URL` to `POSTGRES_*`, then `docker compose down -v && up -d`. |
| `database "nuxtdb" does not exist` | Volume predates `POSTGRES_DB` value → `docker compose down -v && up -d`. |
| Migrations not applying | Confirm files exist in `server/db/migrations/`; run `npm run db:generate` then restart dev. Check `_hub_migrations`. |
| `relation "x" does not exist` | Migration not generated/applied for that table, or barrel missing the `export *` line. |
| NOT NULL add fails | Existing rows → add `.default(...)` or reset dev db (§6). |
| Wrong driver/dialect | `hub.db.dialect` must be `postgresql`; `DATABASE_URL` must start with `postgresql://`. |
| Types out of date after schema edit | Re-run `npm run dev` / `nuxt prepare` to regenerate `@nuxthub/db`. |
| `schema.infos` not found | Old singleton used `infos`; new table is `infoSettings`. Check barrel export matches the actual Drizzle export name. |

---

## Relationship to the other docs

- **AGENTS.md** — build a full vertical CRUD slice (schema → repository → service → presenter → routes).
- **API skill** — the HTTP layer above the repository: endpoint conventions, singleton pattern, validation, presenters.
- **This skill** — everything at the data layer: schema/column changes, migrations, seeding, query authoring, dev-db ops.

When a CRUD task also needs a new table, do §1 + §3 here first, then follow AGENTS.md for the upper layers.