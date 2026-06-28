# Contributing

A practical guide for developers working on this Nuxt 4 + NuxtHub project.

---

## Local setup

```bash
cp .env.example .env
docker compose up -d          # Postgres on :5432
npm install
npm run dev                   # auto-applies migrations on start
curl -X POST http://localhost:3000/api/dev/seed
```

For email (password reset, verification, MFA codes):

```bash
docker compose -f docker-compose.dev.yml up -d   # Mailpit on :8025
```

Open http://localhost:8025 to see outgoing emails. Without Mailpit, the mailer falls back to logging the link to the console.

---

## Architecture — four layers, never skip one

Every feature lives in exactly four files plus routes. Each layer has a strict contract:

```
route handler  server/api/v{N}/<resource>/*.<method>.ts
               HTTP only: validate → call service → present.
               ~10 lines. Never imports @nuxthub/db.

service        server/services/<entity>.service.ts
               Business rules. HTTP-agnostic: no `event`, no status codes.
               Throws notFound / conflict from server/utils/errors.ts.
               Shared across API versions.

repository     server/repositories/<entity>.repository.ts
               The ONLY layer that imports @nuxthub/db.
               No business logic. Just queries.

schema         server/db/schema/<entity>.ts
               One Drizzle table per file.
               Re-exported by server/db/schema.ts barrel.
```

**Exception:** `server/tasks/` files may import `@nuxthub/db` directly. These are maintenance-only scheduled tasks, never called from routes or services. Every task file carries an explicit banner explaining the exception. Do not follow this pattern elsewhere.

---

## Adding a new resource

**Collection** (many rows — e.g. `projects`): follow `AGENTS.md` for the end-to-end recipe and copy-paste templates. Mirror the `users` slice.

**Singleton** (one config row — e.g. `branding`): follow the api skill §2. Mirror any of the five existing singletons (`info`, `seo`, `analytics`, `general`, `contact`).

File naming:
- Collection schema: `server/db/schema/<entity>.ts`
- Singleton schema: `server/db/schema/<entity>Setting.ts` (e.g. `seoSetting.ts`)

---

## Before you open a PR

Run these locally:

```bash
npx nuxt typecheck            # TypeScript — must pass with zero errors
npm run build                 # Nitro build — must succeed
npm run conventions           # Convention checks — must exit 0
```

If you added or changed a `checkRateLimit()` call:

```bash
npm run gen:rate-limits       # Regenerate RATE_LIMITS.md
git add RATE_LIMITS.md        # Commit it alongside the handler change
```

If you changed `server/db/schema/`:

```bash
npm run db:generate           # Generate the migration
git add server/db/migrations/ # Commit the migration file
```

CI enforces all of the above. A PR with a stale `RATE_LIMITS.md` or a missing migration will fail CI.

---

## Pre-commit hook (optional)

Install a git pre-commit hook that regenerates `RATE_LIMITS.md` automatically before every commit:

```bash
echo 'node scripts/gen-rate-limits.mjs && git add RATE_LIMITS.md' \
  > .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

This prevents the most common CI failure (stale `RATE_LIMITS.md`) from reaching the remote.

---

## PR checklist

- [ ] `npx nuxt typecheck` passes
- [ ] `npm run build` passes
- [ ] `npm run conventions` passes with zero warnings
- [ ] `npm run gen:rate-limits` produces no diff (or diff is committed)
- [ ] Migration generated and committed (if schema changed)
- [ ] Handlers are thin — validate → service → present, no DB calls, no business logic
- [ ] Services are HTTP-agnostic — no `event`, no status codes
- [ ] `@nuxthub/db` imported only in `repositories/` (or a task file with the exception banner)
- [ ] PATCH schemas use `.partial().strict().refine(...)`
- [ ] `role` not accepted in a public request body
- [ ] Presenters hand-list fields; no `passwordHash` or secret columns in spread
- [ ] Singleton write handlers purge the cache via `CACHE_STORAGE_KEY` constant

---

## Folder reference

```
server/
  api/v1/            # versioned route handlers
  services/          # business rules (shared across versions)
  repositories/      # DB queries (only layer importing @nuxthub/db)
  db/schema/         # one file per table; schema.ts barrel re-exports all
  tasks/             # scheduled maintenance (exception: may import @nuxthub/db)
  utils/
    auth.ts          # edge: requireUser, requireMinRole, setSessionCookie
    errors.ts        # domain errors: notFound, conflict, unauthorized, forbidden
    rateLimit.ts     # checkRateLimit edge util
    webhook.ts       # requireWebhookSignature
    mailer.ts        # sendMail seam
    presenters/      # one file per resource per API version
shared/
  schemas/v1/        # Zod DTOs — imported by both server and client
  auth/roles.ts      # ROLES, ROLE_RANK, roleAtLeast — single source of truth
```
