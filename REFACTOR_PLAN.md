# Refactor Plan — Nuxt 4 + NuxtHub Full-Stack Template

This plan targets **readability, discoverability, and long-term maintainability**
without changing public API contracts or the layered architecture. Every phase is
independently releasable and passes CI on its own.

---

## What this plan is not

- It does not redesign the architecture. The four-layer model (handler → service →
  repository → schema) is correct and stays.
- It does not change public API contracts (routes, response shapes, auth flows).
- It does not add features.

---

## Phase 1 — Code Hygiene (1–2 days, zero risk)

**Goal:** eliminate small inconsistencies that slow down reading.

### 1.1 Unify JSDoc / comment style across services

All service files use different comment styles (block comment, inline, none).
Adopt a single lightweight pattern: one block comment at the top of each file
explaining _what_ the service owns and _what it does not_ (e.g. "HTTP-agnostic —
no event, no status codes"). Mirror the style already in `mfaPreAuth.service.ts`.

Files to touch: every `server/services/*.ts`.

### 1.2 Normalise `export const <entity>Service = { … }` declaration order

Each service object should expose methods in the same order across all files:
`get / list → create → update → delete → domain-specific verbs`.
Consistent ordering means a developer can scan any service and know where
`delete` is without reading the whole file.

### 1.3 Remove dead/duplicate `console.log` calls

Audit `server/` for debug `console.log` statements left from development.
The only permitted `console.*` calls are `console.error` inside `sendMail` try/catch
blocks and the `[mfa]` error path — document these explicitly with a `// intentional`
comment so future linting doesn't flag them.

### 1.4 Align `shared/schemas/v{N}/` file headers

Each shared schema file should open with a one-line comment naming the version it
belongs to and whether it's collection or singleton. Example:

```ts
// shared/schemas/v1/project.schema.ts — v1 collection resource
```

### 1.5 Add `// intentional exception` comments to `server/tasks/`

The tasks directory is the only non-repository location permitted to import
`@nuxthub/db`. Each task file should carry a top-of-file comment:

```ts
// ARCHITECTURAL EXCEPTION: this is a maintenance task and may import @nuxthub/db
// directly. Do NOT copy this pattern into services, handlers, or plugins.
// See AGENTS.md §1 for the rationale.
```

---

## Phase 2 — Documentation Consolidation (1 day)

**Goal:** one obvious place to look for any convention; no duplication between
`PROJECT_INSTRUCTIONS.md`, `AGENTS.md`, `README.md`, and the skills.

### 2.1 Demote `PROJECT_INSTRUCTIONS.md` to a pointer

`PROJECT_INSTRUCTIONS.md` currently duplicates large sections of `AGENTS.md` and
the skills. Trim it to: stack summary, "where to find the details" table (already
there), and the output expectations section. Remove any rule that is already
canonically stated in a skill — point to the skill instead.

This makes the Claude Project instructions shorter, reducing context waste on
every message.

### 2.2 Add a `CONTRIBUTING.md`

New developers should not need to read the AI-focused docs (`AGENTS.md`,
`PROJECT_INSTRUCTIONS.md`) to understand how to contribute. Create
`CONTRIBUTING.md` with:

- Local setup (already in README, cross-link it)
- The four-layer diagram (copy from AGENTS.md §1)
- "Before you open a PR" checklist (typecheck, `npm run conventions`,
  `npm run gen:rate-limits` if rate limits changed, migration committed)
- Pointer to `.claude/agents/convention-reviewer` for pre-commit review

### 2.3 Add inline `@layer` JSDoc tags to utility helpers

`server/utils/auth.ts`, `server/utils/errors.ts`, `server/utils/webhook.ts`, and
`server/utils/mailer.ts` are imported from multiple layers. Add a one-line
`@module` JSDoc at the top of each saying which layers may import it:

```ts
/**
 * @module auth
 * @importedBy handlers, tasks
 * @notFor services (they receive the resolved user as a plain argument)
 */
```

---

## Phase 3 — TypeScript Tightening (1–2 days, low risk)

**Goal:** eliminate the remaining `!` non-null assertions that are not justified
by a "always-one-row" contract.

### 3.1 Audit all `!` assertions in repositories

The rule is: `return row!` only for always-one-row ops (`create`, `upsert`).
Any `!` on a `findById` / `update` result is a silent bug. Grep:

```bash
grep -rn 'return.*!' server/repositories --include='*.ts'
```

For each hit: verify it's an always-one-row op. If not, change to `| undefined`
and update the caller to guard with `if (!row) throw notFound(...)` in the service.

### 3.2 Introduce `assertExists<T>` helper in `server/utils/errors.ts`

Repeated pattern across services:

```ts
const row = await repo.findById(id)
if (!row) throw notFound('Entity')
return row
```

Extract to:

```ts
export function assertExists<T>(value: T | undefined | null, label: string): T {
  if (value == null) throw notFound(label)
  return value
}
```

Usage: `return assertExists(await repo.findById(id), 'Project')`. Eliminates
boilerplate and gives `notFound` a consistent call site.

### 3.3 Tighten presenter return types

Presenters currently infer their return type. Add explicit return type
annotations so TypeScript catches a missing field immediately at the presenter,
not downstream:

```ts
// before
export function presentProjectV1(row: Project) { … }

// after
export function presentProjectV1(row: Project): ProjectV1Response { … }
```

Define `ProjectV1Response` in `shared/schemas/v1/project.schema.ts` as a Zod
`infer` type so the client can reuse it.

---

## Phase 4 — Singleton Pattern Cleanup (0.5 days)

**Goal:** all five singletons are byte-for-byte structurally identical so a new
developer only needs to read one.

### 4.1 Verify identical cache TTL constants

Each singleton exports a named `CACHE_STORAGE_KEY`. Verify all five use the same
export name shape: `export const CACHE_STORAGE_KEY = 'nitro:functions:...'`.

### 4.2 Verify all five write handlers purge the cache

`npm run conventions` checks for this, but run a manual audit and fix any that
call `useStorage('cache').removeItem` with an inconsistent key string (must use
the exported constant, not a bare string).

### 4.3 Add a `// SINGLETON PATTERN` banner to each singleton index file

Place a four-line comment at the top of every `server/api/v1/{singleton}/index.get.ts`:

```ts
// SINGLETON PATTERN — one row pinned to id = 1.
// GET: cached read (cachedEventHandler). POST/PATCH: upsert + cache purge.
// No [id] routes. See api skill §2 for the full pattern.
// Cache key: import CACHE_STORAGE_KEY from './index.get'
```

---

## Phase 5 — Script & CI Hardening (0.5–1 day)

**Goal:** `npm run conventions` catches everything CI catches; no surprise CI failures.

### 5.1 Add singleton cache-key constant check to `check-conventions.sh`

Current check verifies `removeItem` is present but not that it uses the exported
constant. Add a grep that flags bare string literals inside `removeItem(...)` calls:

```bash
grep -rn "removeItem('" server/api --include='*.ts'
```

Flag any result as a convention violation (must use the constant).

### 5.2 Make `gen-rate-limits.mjs` a pre-commit hook option

Document in `CONTRIBUTING.md` how to install it as a git pre-commit hook:

```bash
echo 'node scripts/gen-rate-limits.mjs && git add RATE_LIMITS.md' \
  > .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit
```

This prevents the most common CI failure (stale `RATE_LIMITS.md`) before push.

### 5.3 Add `.env.example` auto-check to local convention script

CI already checks `.env.example` drift (step 10). Mirror this in
`check-conventions.sh` so developers see it locally before push.

---

## Phase 6 — New Skill and Agent (see separate files)

Deliver `.claude/skills/refactor/SKILL.md` and `.claude/agents/refactor-auditor.md`
so future refactor sessions follow the same discipline as feature development.
See below for the full file contents.

---

## Execution order

```
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6
```

Phases 1–2 are pure documentation/comment changes — zero compile risk.
Phase 3 has the most test surface; do it after the docs are settled.
Phases 4–5 are mechanical and low-risk.
Phase 6 is metadata (`.claude/` files) — no runtime impact.

Each phase should be a separate PR so CI validates it independently and the
convention-reviewer agent can be run against each diff cleanly.

---

## Definition of done (all phases)

- [ ] `npx nuxt typecheck` passes
- [ ] `npm run build` passes
- [ ] `npm run conventions` passes with zero warnings
- [ ] `npm run gen:rate-limits` produces no diff against committed `RATE_LIMITS.md`
- [ ] `convention-reviewer` agent reports no findings against the combined diff
- [ ] `refactor-auditor` agent (Phase 6) reports no remaining debt items