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

​```
AGENTS.md                         # playbook: how an agent adds a CRUD resource
PROJECT_INSTRUCTIONS.md           # paste into a Claude Project's custom instructions
.claude/skills/
  api/SKILL.md                    # endpoint patterns, singleton resource, validation
  database/SKILL.md               # schema, migrations, queries, seeding
  auth/SKILL.md                   # DB-backed sessions + scrypt; login/register/logout/me
  rbac/SKILL.md                   # roles, privilege ladder, requireMinRole/requireRole
  rate-limit/SKILL.md             # DB-backed throttling + lockout for the auth routes
docker-compose.yml                # prod stack: Nuxt (node-server) + Postgres + Caddy
layers/                           # Nuxt layers
  1.auth/                         # login/register pages, useAuth, auth + role middleware
  2.admin/                        # admin layout + role-gated admin area
  3.portal/                       # signed-in user portal (dashboard, etc.)
app/                              # base Nuxt 4 client app
server/
  api/
    v1/users/                     # full CRUD reference slice
    v1/auth/                      # login, register, logout, me, mfa/verify, reset, verify-email
    v1/admin/                     # role-gated (requireMinRole)
    v2/users/                     # versioned edge over the shared service
    dev/seed.post.ts              # dev-only seeder
  middleware/csrf.ts              # global Origin-check CSRF (edge protection)
  services/                       # business rules (shared across versions)
  repositories/                   # the ONLY layer importing @nuxthub/db
  tasks/auth/cleanup.ts           # scheduled prune of expired sessions/tokens/buckets
  db/
    schema.ts                     # BARREL — re-exports every table
    schema/                       # user, info, session, passwordResetToken,
                                  #   emailVerificationToken, mfaCode, rateLimitAttempt
  utils/                          # auth.ts, rateLimit.ts, errors.ts, presenters/
shared/
  schemas/v1/                     # Zod DTOs shared client+server
  auth/roles.ts                   # role ladder (single source of truth)
​```

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

- **`AGENTS.md`** — build a full vertical CRUD slice for a *collection* resource.
- **`.claude/skills/api/SKILL.md`** — HTTP layer: endpoints, singleton pattern, validation, presenters, versioning, TS gotchas.
- **`.claude/skills/database/SKILL.md`** — data layer: schema, migrations, seeding, the Drizzle cookbook, Postgres ops.
- **`.claude/skills/auth/SKILL.md`** — identity: DB-backed sessions, scrypt, login/register/logout/me.
- **`.claude/skills/rbac/SKILL.md`** — authorization: roles, `requireMinRole`/`requireRole`, 401 vs 403.
- **`.claude/skills/rate-limit/SKILL.md`** — abuse defense: DB-backed throttling + lockout on the auth routes.
- **`.claude/skills/account-security/SKILL.md`** — reset / verify-email / MFA: the hashed one-time-secret flows and the mailer seam.

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
