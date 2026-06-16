# Nuxt 4 + NuxtHub — Layered Backend Starter

A minimal but real example of a full-stack Nuxt app with a **layered backend**
and **API versioning**. One `users` resource is implemented end to end so you
can see every layer and how a request flows through them.

## The flow of one request

```
client (app/pages/index.vue)
   │  $fetch('/api/v1/users')
   ▼
route handler (server/api/v1/users/*)   ← HTTP only: validate, delegate, present
   ▼
service (server/services/user.service)  ← business rules, HTTP-agnostic, SHARED across versions
   ▼
repository (server/repositories/*)       ← the only layer that touches Drizzle
   ▼
database (server/db/schema.ts)           ← single source of truth, via @nuxthub/db
```

## Why each layer exists

- **Route handler** — Owns HTTP concerns only: parse + validate input (Zod),
  call a service, shape the response, let domain errors map to status codes.
  Stays a few lines long.
- **Service** — Business logic ("emails must be unique"). Knows nothing about
  requests or responses, so it's trivially unit-testable. Shared by all API
  versions.
- **Repository** — Every Drizzle query lives here. Swap ORMs or add caching in
  one place without touching anything above.
- **Schema** — `server/db/schema.ts` is the single source of truth. NuxtHub
  auto-generates the `@nuxthub/db` client and types from it.

## Versioning: version the edge, not the core

Only `server/api/` gets versioned folders. Services and repositories are shared.
What differs between versions is the **contract** — input validation and
response shape — not the business logic.

| | v1 | v2 |
|---|---|---|
| Route | `/api/v1/users` | `/api/v2/users` |
| Shape | flat fields, `created_at` as unix ms | nested `profile`, `createdAt` as ISO |
| Service | `userService.list()` | **same** `userService.list()` |
| Presenter | `presenters/user.v1.ts` | `presenters/user.v2.ts` |

Compare `server/api/v1/users/index.get.ts` with `server/api/v2/users/index.get.ts`:
identical service call, different presenter. That's the whole idea.

When you ship a new version, freeze the old one (bug fixes only) and set a
deprecation date. Adding versions is cheap; keeping them alive forever is not.

## Folder structure

```
AGENTS.md                    # playbook: how an AI agent adds a CRUD resource
PROJECT_INSTRUCTIONS.md      # paste into a Claude Project's custom instructions
.claude/skills/database/SKILL.md  # database skill: schema, migrations, queries, seeding
.claude/skills/api/SKILL.md       # api skill: endpoint patterns, singleton resource, validation
docker-compose.yml           # local dev Postgres (reads POSTGRES_* from .env)
app/                         # Nuxt 4 client app
  pages/index.vue            # demo UI; reuses the shared v1 Zod schema
server/
  api/
    v1/users/                # full CRUD: list, create, read, update, delete
    v2/users/                # /api/v2/users  (GET list — same service, new shape)
    dev/seed.post.ts         # dev-only seeder (POST /api/dev/seed)
  services/user.service.ts   # business logic (shared)
  repositories/user.repository.ts  # Drizzle queries (shared)
  db/
    schema.ts                # BARREL — re-exports every table; NuxtHub reads this
    schema/
      user.ts                # users table (has a full CRUD slice — the reference)
      info.ts                # info table — NO crud yet, left for an AI agent to build
  utils/
    errors.ts                # domain error helpers
    presenters/              # per-version response shapers
shared/
  schemas/v1/user.schema.ts  # Zod DTOs, imported by BOTH client and server
```

### Schema is split per table

Each table is its own file under `server/db/schema/`, and `server/db/schema.ts`
is a barrel that re-exports all of them. NuxtHub reads the barrel to generate
`@nuxthub/db`. To add a table: create `server/db/schema/<name>.ts`, then add one
`export * from './schema/<name>'` line to the barrel.

### Generating CRUD with an AI agent

`info.ts` is defined but has no repository/service/routes — on purpose. Hand
`AGENTS.md` to Claude Code / Cursor / any agent and use the prompt at the bottom
of that file to have it scaffold the full `info` CRUD by mirroring `users`. The
playbook encodes every convention so the output matches the rest of the project.

### Agent references (use the right one)

- **`AGENTS.md`** — builds a full vertical CRUD slice (schema → repository →
  service → presenter → versioned routes) for a *collection* resource.
- **`.claude/skills/api/SKILL.md`** — the HTTP layer: endpoint conventions, the
  *singleton* resource pattern (one row, get + upsert), Zod validation,
  presenters, versioning, and the TypeScript gotchas of this stack.
- **`.claude/skills/database/SKILL.md`** — the data layer: schema and column
  changes, migrations, seeding, the Drizzle query cookbook, local Postgres ops,
  and troubleshooting.

Claude Code auto-discovers the two skills under `.claude/skills/`; other agents
can read them directly or you can paste them into a prompt.

## Run it (Postgres, dev)

This starter is configured for **PostgreSQL**. For local dev, spin up Postgres
with Docker (uses the `POSTGRES_*` vars from your `.env`):

```bash
cp .env.example .env          # then edit if needed
docker compose up -d          # starts Postgres on localhost:5432
npm install
npm run dev                   # NuxtHub auto-applies migrations on dev start
```

`hub.db.dialect` is `postgresql` and `connection` reads `DATABASE_URL`, so
NuxtHub selects the postgres-js driver automatically. Open the app, add a user,
then compare the two API versions:

- http://localhost:3000/api/v1/users
- http://localhost:3000/api/v2/users

No Docker? Point `DATABASE_URL` at any reachable Postgres (local install, Neon,
Supabase) — nothing else changes.

## Notes on NuxtHub specifics

- **Don't** create `drizzle.config.ts` by hand — NuxtHub generates it.
- **Don't** add `@nuxthub/db` to `package.json` — it's auto-generated on
  `nuxt dev` / `nuxt build` from your schema.
- Migrations live in `server/db/migrations/`. Generate SQL with
  `npm run db:generate`; the dev server applies pending migrations
  automatically. For deploys, run `npm run db:migrate` (`nuxt db migrate`).
- To switch dialects, change `hub.db.dialect` and the schema imports
  (`pg-core` ↔ `sqlite-core` ↔ `mysql-core`). The repository/service/route code
  is dialect-agnostic and does not change.

> Version pins in `package.json` are indicative. Run `npm create nuxt@latest`
> for a fresh project if you want the newest pinned versions, then drop these
> `server/`, `shared/`, and `app/` files in.
