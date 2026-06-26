# Nuxt 4 + NuxtHub — Layered Backend Starter

A full-stack Nuxt app with a **layered backend**, **API versioning**, auth, RBAC,
rate limiting, account security (reset / verify / MFA), and five settings
singletons. The `users` resource is the collection reference; `info` is the
singleton reference.

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

- **Route handler** — Owns HTTP concerns only: parse + validate input (Zod), call a service, shape the response. Stays ~10 lines or fewer.
- **Service** — Business logic ("emails must be unique"). Knows nothing about requests or responses. Shared by all API versions.
- **Repository** — Every Drizzle query lives here. Swap ORMs or add caching in one place without touching anything above.
- **Schema** — `server/db/schema.ts` is the single source of truth. NuxtHub auto-generates the `@nuxthub/db` client and types from it.

## Versioning: version the edge, not the core

Only `server/api/` gets versioned folders. Services and repositories are shared.
What differs between versions is the **contract** — input validation and response shape — not the business logic.

| | v1 | v2 |
|---|---|---|
| Route | `/api/v1/users` | `/api/v2/users` |
| Shape | flat fields, `created_at` as unix ms | nested `profile`, `createdAt` as ISO |
| Service | `userService.list()` | **same** `userService.list()` |
| Presenter | `presenters/user.v1.ts` | `presenters/user.v2.ts` |

When you ship a new version, freeze the old one (bug fixes only) and set a deprecation date.

## Folder structure

```
AGENTS.md                         # playbook: how an agent adds a CRUD resource
PROJECT_INSTRUCTIONS.md           # paste into a Claude Project's custom instructions
.claude/
  skills/
    api/SKILL.md                  # endpoint patterns, singleton resource, caching, validation
    database/SKILL.md             # schema, migrations, queries, seeding
    auth/SKILL.md                 # DB-backed sessions + async scrypt; login/register/logout/me
    rbac/SKILL.md                 # roles, privilege ladder, requireMinRole/requireRole
    rate-limit/SKILL.md           # DB-backed throttling + lockout for the auth routes
    account-security/SKILL.md     # password reset, email verify, email-OTP MFA
  agents/
    resource-scaffolder.md        # generates a full resource slice
    convention-reviewer.md        # reviews a changeset against hard rules
docker-compose.yml                # prod stack: Nuxt (node-server) + Postgres + Caddy
docker-compose.dev.yml            # dev extras: Mailpit (SMTP catcher, port 8025)
layers/
  1.auth/                         # login/register pages, useAuth, auth + role middleware
  2.admin/                        # admin layout + role-gated admin area
  3.portal/                       # signed-in user portal (dashboard, etc.)
app/                              # base Nuxt 4 client app
server/
  api/
    v1/users/                     # collection reference: list, create, get, patch, delete
    v1/users/[id]/role.patch.ts   # super_admin-only role mutation (isolated endpoint)
    v1/auth/                      # login, register, logout, me
                                  # forgot-password, reset-password
                                  # verify-email, resend-verification
                                  # mfa/send, mfa/verify, mfa/enable, mfa/disable
    v1/admin/                     # role-gated area (requireMinRole 'admin')
    v1/info/                      # singleton: app identity & branding (super_admin writes, GET cached 24h)
    v1/seo/                       # singleton: SEO metadata (super_admin writes, GET cached 24h)
    v1/analytics/                 # singleton: analytics config (super_admin writes, GET cached 1h)
    v1/general/                   # singleton: maintenance mode etc. (super_admin writes, GET cached 5min)
    v1/contact/                   # singleton: contact details (admin writes, GET cached 6h)
    v1/webhooks/                  # CSRF-exempt; handlers must call requireWebhookSignature
    v2/users/                     # versioned edge over the shared service
    dev/seed.post.ts              # dev-only seeder (403 in production)
  middleware/
    csrf.ts                       # global Origin-check CSRF; exempts /api/webhooks
  services/                       # business rules (shared across versions)
  repositories/                   # the ONLY layer importing @nuxthub/db
  tasks/auth/cleanup.ts           # scheduled prune of expired sessions/tokens/buckets
  db/
    schema.ts                     # BARREL — re-exports every table
    schema/
      user.ts                     # users (email unique, role CHECK, mfaEnabled, emailVerifiedAt)
      infoSetting.ts              # info_settings — branding & identity
      seoSetting.ts               # seo_settings
      analyticSetting.ts          # analytics_settings
      contactSetting.ts           # contact_settings
      generalSetting.ts           # general_settings (maintenanceMode)
      session.ts                  # sessions (token unique, userId FK cascade)
      passwordResetToken.ts       # password_reset_tokens (tokenHash, expiresAt)
      emailVerificationToken.ts   # email_verification_tokens (tokenHash, expiresAt)
      mfaCode.ts                  # mfa_codes (codeHash, attempts, expiresAt)
      rateLimitAttempt.ts         # rate_limit_attempts (atomic upsert bucket)
  utils/
    auth.ts                       # edge: setSessionCookie, requireUser, requireMinRole,
                                  #        requireRole, assertCanAssignRole, requireVerifiedUser
    rateLimit.ts                  # checkRateLimit edge util
    webhook.ts                    # requireWebhookSignature (HMAC-SHA256)
    mailer.ts                     # sendMail seam (Mailpit dev / provider prod)
    errors.ts                     # notFound, conflict, unauthorized, forbidden, tooManyRequests
    presenters/                   # one file per resource per version
shared/
  schemas/v1/                     # Zod DTOs shared client+server
    auth.schema.ts
    user.schema.ts                # createUserV1, updateUserV1, setRoleV1
    info.schema.ts
    seo.schema.ts
    analytics.schema.ts
    contact.schema.ts
    general.schema.ts
  auth/roles.ts                   # ROLES, ROLE_RANK, roleAtLeast (single source of truth)
```

### Schema is split per table

Each table is its own file under `server/db/schema/`, and `server/db/schema.ts` is a barrel that re-exports all of them. NuxtHub reads the barrel to generate `@nuxthub/db`. To add a table: create `server/db/schema/<name>.ts`, then add `export * from './schema/<name>'` to the barrel.

### The reference resources

`users` is the **collection** reference (many rows, full CRUD). `info` is the **singleton** reference (one config row, `GET` cached + public, `POST`/`PATCH` role-gated — `infoService.get` / `infoService.save`). Copy whichever shape matches the resource you're adding.

### Adding a new resource

Use the **resource-scaffolder** agent (`.claude/agents/resource-scaffolder.md`): it reads AGENTS.md + the api/database skills and generates the full slice (schema → repository → service → presenter → versioned routes), then typechecks. To do it by hand instead, follow AGENTS.md (collection) or the api skill §2 (singleton).

### Agent references (use the right one)

- **`AGENTS.md`** — build a full vertical CRUD slice for a *collection* resource.
- **`.claude/skills/api/SKILL.md`** — HTTP layer: endpoints, singleton pattern + caching, validation, presenters, versioning, TS gotchas.
- **`.claude/skills/database/SKILL.md`** — data layer: schema, migrations, seeding, the Drizzle cookbook, Postgres ops.
- **`.claude/skills/auth/SKILL.md`** — identity: DB-backed sessions, async scrypt, login/register/logout/me, `requireUser`.
- **`.claude/skills/rbac/SKILL.md`** — authorization: roles, `requireMinRole`/`requireRole`/`assertCanAssignRole`/`requireVerifiedUser`, 401 vs 403.
- **`.claude/skills/rate-limit/SKILL.md`** — abuse defense: DB-backed throttling + lockout.
- **`.claude/skills/account-security/SKILL.md`** — reset / verify-email / MFA: hashed one-time-secret flows and the mailer seam.

### Agents (`.claude/agents/`)

- **`resource-scaffolder`** — generates a complete resource slice, then runs `db:generate` + `typecheck`.
- **`convention-reviewer`** — reviews a changeset against the hard rules. Reports only; never edits.

## Run it (Postgres, dev)

```bash
cp .env.example .env
docker compose up -d          # Postgres on :5432
npm install
npm run dev                   # auto-applies migrations
curl -X POST http://localhost:3000/api/dev/seed
```

For email (password reset, verify, MFA):

```bash
docker compose -f docker-compose.dev.yml up -d   # Mailpit on :8025
```

Open http://localhost:8025 to see emails. Without Mailpit, the mailer falls back to console-logging the link.

- http://localhost:3000/api/v1/users — requires login; all users, flat shape
- http://localhost:3000/api/v2/users — requires login; hides admin/super_admin rows

No Docker? Point `DATABASE_URL` at any reachable Postgres — nothing else changes.

## Upgrading core dependencies
 
`@nuxthub/core`, `nuxt`, `drizzle-orm`, and `drizzle-kit` are pinned to exact
versions in `package.json`. Minor bumps in these packages have historically
introduced breaking schema generation, session middleware, or Nitro bundler
behaviour — a failed deploy is worse than a manual upgrade step.
 
To upgrade any of them:
 
1. Change the version in `package.json`
2. Run `npm install`
3. Run `npm run db:generate` — inspect any new migration file before committing
4. Run `npx nuxt typecheck`
5. Run `npm run build`
6. Check the NuxtHub + Drizzle changelogs for breaking changes
7. Commit `package.json` and `package-lock.json` together in one PR
All other packages (`tailwindcss`, `pinia`, `vue`, `zod`, etc.) keep `^` because
their API surface touching this project is stable across minor versions.