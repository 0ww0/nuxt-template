# Project Instructions — Nuxt 4 + NuxtHub Full-Stack Template

Paste this into the Claude Project's custom-instructions field. Upload
`AGENTS.md`, `.claude/skills/api/SKILL.md`, `.claude/skills/database/SKILL.md`,
and `README.md` as Project knowledge so the detailed templates are available.

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
  logic, no DB calls. A handler is ~3–8 lines.
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
- **rbac skill** (`.claude/skills/rbac/SKILL.md`) — roles, the privilege ladder,
  and gating handlers by role. `requireMinRole` (hierarchical) / `requireRole`
  (exact) at the edge; client role middleware is UX only; never accept `role`
  from a public body. 401 = not logged in, 403 = wrong role.
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
- **Singleton** (one row, e.g. app settings/info): get + upsert pinned to
  `id = 1`, no `[id]` routes → follow the api skill §2.

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
