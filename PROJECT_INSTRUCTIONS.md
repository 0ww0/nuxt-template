# Project Instructions — Nuxt 4 + NuxtHub Full-Stack Template

Paste this into the Claude Project's custom-instructions field.
Upload `AGENTS.md`, everything under `.claude/skills/`, `.claude/agents/`, and `README.md`.
---

You are helping build features in a Nuxt 4 + NuxtHub full-stack template. Follow
its conventions exactly and produce code that drops into the existing structure
without rework. Prefer matching the template over "better" alternatives.

## Stack
- Nuxt 4 (`app/` for client, `server/` for the Nitro backend).
- NuxtHub (v0.10+) for the backend platform; database via Drizzle ORM.
- PostgreSQL, `drizzle-orm/pg-core`. Local dev DB runs via `docker-compose.yml`.
- Zod for validation, shared between client and server.
- Auth via a DB-backed `sessions` table (token in a hardened httpOnly cookie);
  password hashing with `node:crypto` scrypt. Roles on the `users.role` column,
  enforced at the edge via `server/utils/auth.ts`.

## Architecture — layered, never skip a layer
```
route handler (server/api/v{N}/<resource>/*)  → HTTP only
service (server/services/<entity>.service.ts)  → business rules, HTTP-agnostic, shared across versions
repository (server/repositories/<entity>.repository.ts) → the ONLY layer that imports @nuxthub/db
schema (server/db/schema/<entity>.ts)          → one table per file, re-exported by server/db/schema.ts
```
Hard rules:
- Route handlers are thin: validate → call a service → present. No business
  logic, no DB calls. A handler is ~10 lines or fewer.
- Services never touch HTTP (`event`, status codes, `readBody`). They take plain
  args, return domain objects, and throw `notFound`/`conflict` from
  `server/utils/errors.ts`.
- Only repositories run queries / import `@nuxthub/db`.
- Version the edge, not the core: only `server/api/v{N}/` folders are versioned;
  services and repositories are shared across versions.
- Validation schemas live in `shared/schemas/v{N}/` so the client can reuse them.
- Scheduled maintenance tasks under `server/tasks/` may import `@nuxthub/db`
  directly — a documented exception to "only repositories import @nuxthub/db",
  allowed because they're maintenance-only and never called from routes/services.
  Do not use as precedent (see `server/tasks/auth/cleanup.ts`).

## Where to find the details (Project knowledge)
- **agents** (`.claude/agents/`) — `resource-scaffolder` (scaffold a full slice)
  and `convention-reviewer` (check a changeset against the hard rules). Agents use
  the skills as their source of truth; they don't restate conventions.
- **AGENTS.md** — end-to-end recipe + copy-paste templates to scaffold a full
  *collection* CRUD slice (many rows). Use it when adding a new resource.
- **api skill** (`.claude/skills/api/SKILL.md`) — endpoint conventions, the
  *singleton* resource pattern (one config row: get + upsert), validation,
  presenters, versioning, and TypeScript gotchas.
- **database skill** (`.claude/skills/database/SKILL.md`) — schema/column
  changes, migrations, seeding, the Drizzle query cookbook, local Postgres ops,
  troubleshooting.
- **auth skill** (`.claude/skills/auth/SKILL.md`) — DB-backed sessions, async scrypt
  password hashing, login/register/logout/me endpoints, `requireUser`, session
  revocation, and the `useAuth()` composable. MFA login issues an `mfa_preauth`
  httpOnly cookie — `/mfa/send` has no body, `/mfa/verify` takes `{ code }` only.
  Use for anything involving identity or session logic.
- **rbac skill** (`.claude/skills/rbac/SKILL.md`) — roles, the privilege ladder,
  and gating handlers by role. `requireMinRole` (hierarchical) / `requireRole`
  (exact) / `requireVerifiedUser` (login + email verified) at the edge;
  `assertCanAssignRole(actor, role)` caps the assignable rank on role-mutation
  endpoints; client role middleware is UX only; never accept `role` from a public
  body. 401 = not logged in, 403 = wrong role.
- **rate-limit skill** (`.claude/skills/rate-limit/SKILL.md`) — DB-backed
  throttling + lockout (table → repository → service → `checkRateLimit` edge util),
  called per-handler before DB/crypto work. Per-IP + per-account buckets; 429 +
  Retry-After. Not KV, not global middleware.
- **account-security skill** (`.claude/skills/account-security/SKILL.md`) —
  password reset, email verification, and email-OTP MFA, all built on one hashed
  one-time-secret primitive (store the SHA-256, email the raw value once,
  single-use, expire). Mailer seam in `server/utils/mailer.ts`.
Consult the relevant doc before writing code; mirror its templates.

## Choose the resource shape first
- **Collection** (many rows, e.g. users): list/create/read/update/delete →
  follow AGENTS.md.
- **Singleton** (one row, e.g. settings): `GET` (cached public read via `cachedEventHandler`) + `POST`/`PATCH` (upsert + cache purge), pinned to `id = 1`, no `[id]` routes → follow the api skill §2. Five already exist: `info` (branding), `seo`, `analytics`, `general` (maintenance mode), `contact`. Mirror any of them for a new one. Singleton schema files use the `<Entity>Setting.ts` naming convention.

## Conventions cheat-sheet
- Files per resource: `server/db/schema/<entity>.ts` (+ barrel re-export),
  `server/repositories/<entity>.repository.ts`,
  `server/services/<entity>.service.ts`,
  `shared/schemas/v{N}/<entity>.schema.ts`,
  `server/utils/presenters/<entity>.v{N}.ts`,
  routes under `server/api/v{N}/<resource>/` as method-suffixed files
  (`index.get.ts`, `index.post.ts`, `[id].get.ts`, `[id].patch.ts`, `[id].delete.ts`).
- Validation: `readValidatedBody(event, schema.parse)`;
  `getValidatedRouterParams(event, z.object({ id: z.coerce.number()... }).parse)`;
  PATCH schemas use `.partial().strict().refine(...)` — `.strict()` blocks
  mass-assignment of `id`/timestamps.
- Presenters define the response contract and convert dates. Hand-list fields
  for small records; spread + convert timestamps for large ones. Skip only when
  the client controls the shape.
- Status codes: create → 201; delete → 204 + `return null`. Nitro returns 405
  automatically — never write a method switch or 405 branch.
- Singleton GETs use `cachedEventHandler` with `name` + `getKey: () => 'singleton'` + an exported `CACHE_STORAGE_KEY`. Write handlers purge via `useStorage('cache').removeItem(KEY)` after saving. Singleton schema files are named `<Entity>Setting.ts` (e.g. `infoSetting.ts`).

## Webhooks
- Third-party webhook handlers live under `server/api/webhooks/`.
- The CSRF middleware (`server/middleware/csrf.ts`) exempts `/api/webhooks` from
  the Origin-check because these are cross-origin server-to-server calls. **That
  exemption is all the middleware does for webhooks** — it performs no header or
  signature check of its own, on purpose, since providers each use a different
  signature header (see below) and a single default header would reject every
  provider that doesn't use it.
- **Every handler under `/api/webhooks/` MUST call
  `requireWebhookSignature(event)` from `server/utils/webhook.ts` as its first
  line** — this verifies the HMAC-SHA256 signature and returns the raw body
  string. This is the sole signature gate; CI hard-fails any webhook handler
  that skips it.
- Override `options.header` per provider (e.g. Stripe uses `stripe-signature`,
  GitHub uses `x-hub-signature-256`); override `options.secret` when receiving
  from multiple providers with different secrets. The default reads
  `runtimeConfig.webhookSecret`.

## NuxtHub specifics (do NOT get these wrong)
- DB config in `nuxt.config.ts`: `hub.db.dialect = 'postgresql'`,
  `hub.db.casing = 'snake_case'`, connection from `process.env.DATABASE_URL`.
- One table per file under `server/db/schema/`; re-export from the
  `server/db/schema.ts` barrel.
- Do NOT create `drizzle.config.ts` (NuxtHub generates it) or add `@nuxthub/db`
  to `package.json` (auto-generated from the schema).
- Migrations: `npm run db:generate` (`nuxt db generate`); dev server
  auto-applies; deploys use `npm run db:migrate`.
- Import the DB client as `@nuxthub/db` (not the legacy `hub:db`), only in repositories.
- NuxtHub moves fast — if a version-sensitive API detail is uncertain, say so and
  verify against current NuxtHub docs rather than guessing.

## Tooling & automation
- **`npm run conventions`** (`scripts/check-conventions.sh`) — run before committing. Checks: `@nuxthub/db` import discipline, HTTP-agnostic services, PATCH `.strict()`, role in public schemas, webhook signature enforcement, singleton cache-purge presence, secret-column presenter spreads.
- **`npm run gen:rate-limits`** (`scripts/gen-rate-limits.mjs`) — must be run and committed alongside any `checkRateLimit` call change. CI fails if `RATE_LIMITS.md` is stale.
- **`server/plugins/secretsCheck.ts`** — startup guard that hard-throws if `NUXT_SESSION_SECRET` is shorter than 32 chars (all environments), and warns if `NUXT_WEBHOOK_SECRET` or `SMTP_HOST` are missing in production.
- **CI** (`.github/workflows/ci.yml`) — 10 checks: typecheck, Nitro build, `@nuxthub/db` discipline, HTTP-agnostic services, webhook signature, PATCH `.strict()`, role schemas, `RATE_LIMITS.md` freshness, migration drift, `.env.example` coverage.

## TypeScript (project sets `noUncheckedIndexedAccess`)
- `const [row] = await db…returning()` is `T | undefined`.
  - Always-one-row ops (`create`, `upsert`): `return row!` and declare a
    non-optional return type.
  - May-be-missing ops (`findById`, `update` by arbitrary id): keep `| undefined`.
  - When the caller knows the row exists (after a guard), assert at the call
    site: `presentV1((await service.update(id, body))!)`.

## Output expectations
- Produce real files at the correct paths, not snippets, when adding features.
- Keep responses focused; show the files and a one-line note per file, not essays.
- If a request conflicts with these conventions, flag it and propose the
  template-consistent approach before deviating.
- When unsure about a convention, check the Project-knowledge docs first; if it's
  genuinely undefined there, ask rather than inventing a new pattern.
