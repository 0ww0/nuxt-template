---
name: refactor
description: Use this skill when making non-feature changes to improve readability, remove technical debt, or harden the codebase — such as normalising comments, tightening TypeScript types, consolidating duplicate logic, or aligning code against the project's layered conventions. Covers: code hygiene (comment style, dead code, consistent export order), TypeScript tightening (non-null assertions, explicit return types, the assertExists helper), singleton pattern alignment, script/CI hardening, and documentation consolidation. Trigger on phrasing like "clean up", "tighten types", "refactor X", "standardise comments", "fix tech debt", or "align with conventions". Do NOT use for adding new features, changing API contracts, schema migrations, or auth/security changes (those have their own skills).
---

# Refactor Skill

Non-feature changes that improve readability and long-term maintainability.
This skill does **not** change public contracts, API routes, or the layered architecture.

---

## 0. Principles

1. **No layer skipping.** A refactor that moves logic across layers (e.g. DB call into a service) is a bug, not a cleanup.
2. **CI must pass on every commit.** Each atomic change is independently deployable.
3. **One concern per PR.** Comment cleanup, type tightening, and singleton alignment go in separate PRs so the convention-reviewer can give a focused verdict.
4. **Run the `refactor-auditor` agent before opening the PR.** It produces the finding list; you fix the list.

---

## §1 Code hygiene

### Comment style

Each `server/services/*.ts` file must open with a block comment covering:
- What entity/domain this service owns
- What it explicitly does NOT do (usually: no HTTP, no DB)
- Cross-references to related services if the flow spans multiple services

Template (adapt to the entity):

```ts
// server/services/<entity>.service.ts
// Business rules for <Entity>. HTTP-agnostic — never import `event` or status codes.
// DB access via <entity>.repository.ts only.
// Throws: notFound / conflict from server/utils/errors.ts.
// See also: <RelatedService> (if flow spans two services).
```

### Task file exception banner

Every file under `server/tasks/` must carry this banner as its first comment:

```ts
// ARCHITECTURAL EXCEPTION: scheduled maintenance task.
// May import @nuxthub/db directly — this is the only permitted non-repository use.
// Do NOT copy this import into services, handlers, or plugins. See AGENTS.md §1.
```

### Dead code

Permitted `console.*` calls:
- `console.error` inside `sendMail` try/catch — mark `// intentional: mail errors must not bubble`
- `console.error` inside `mfaService.sendCode` — same annotation

All other `console.log` / `console.debug` / `console.warn` in `server/` are dead
code and must be removed.

### Service method order

Methods inside every `export const <entity>Service = { … }` object follow:

```
get / list → create → update / save → delete / remove → domain-specific verbs
```

If a service has no `get`, start at `list`. If it has no `list`, start at `create`.
Domain-specific verbs (e.g. `setRole`, `issueToken`, `sendCode`) always trail.

---

## §2 TypeScript tightening

### Non-null assertion audit

Only `return row!` on always-one-row repository operations (`create`, `upsert`).
All other `!` on a repository result is a latent bug.

Audit command:
```bash
grep -rn 'return.*!' server/repositories --include='*.ts'
```

For each hit: if the operation is `findById`, `update`, or any query that may
return zero rows — remove the `!`, change the return type to `T | undefined`, and
update the caller to guard in the service.

### `assertExists` helper

Add to `server/utils/errors.ts`:

```ts
/**
 * Asserts that a value is non-null/undefined, throwing notFound if not.
 * Use in services after a repository findById call.
 *
 * @example
 *   const project = assertExists(await projectRepo.findById(id), 'Project')
 */
export function assertExists<T>(value: T | null | undefined, label: string): T {
  if (value == null) throw notFound(label)
  return value
}
```

Replace the repeated `if (!row) throw notFound(...)` pattern in services:

```ts
// before
const row = await projectRepo.findById(id)
if (!row) throw notFound('Project')
return presentV1(row)

// after
return presentV1(assertExists(await projectRepo.findById(id), 'Project'))
```

### Explicit presenter return types

Define a Zod infer type for each presenter's output in `shared/schemas/v{N}/`:

```ts
// shared/schemas/v1/project.schema.ts
export const projectV1ResponseSchema = z.object({
  id: z.number(),
  name: z.string(),
  createdAt: z.number(), // unix ms
})
export type ProjectV1Response = z.infer<typeof projectV1ResponseSchema>
```

Then annotate the presenter:

```ts
// server/utils/presenters/project.v1.ts
import type { ProjectV1Response } from '~/shared/schemas/v1/project.schema'

export function presentProjectV1(row: Project): ProjectV1Response {
  return { id: row.id, name: row.name, createdAt: row.createdAt.getTime() }
}
```

TypeScript will fail the build immediately if a field is added to the schema but
not to the presenter, or vice versa.

---

## §3 Singleton alignment

All five singletons (`info`, `seo`, `analytics`, `general`, `contact`) must be
structurally identical. Use this checklist against each one:

- [ ] Schema file named `<Entity>Setting.ts` (e.g. `infoSetting.ts`)
- [ ] Drizzle export is plural camelCase (`infoSettings`)
- [ ] Types: `InfoSetting` / `NewInfoSetting`
- [ ] `CACHE_KEY` and `CACHE_STORAGE_KEY` exported from `index.get.ts`
- [ ] `index.get.ts` uses `cachedEventHandler`; `name:` matches the resource path
- [ ] `index.post.ts` and `index.patch.ts` call `useStorage('cache').removeItem(CACHE_STORAGE_KEY)` after the save — using the constant, not a bare string
- [ ] No `[id]` route files exist for this resource
- [ ] `index.get.ts` carries the singleton banner comment (see Phase 4.3 of REFACTOR_PLAN.md)

If adding a new singleton, mirror the checklist above before writing a single line.

---

## §4 Documentation consolidation

`PROJECT_INSTRUCTIONS.md` (the Claude Project custom instructions field) must not
duplicate content from skills. If a rule is already canonically stated in a skill,
`PROJECT_INSTRUCTIONS.md` should point to the skill, not restate the rule.

Allowed in `PROJECT_INSTRUCTIONS.md`:
- Stack summary (< 10 lines)
- "Where to find the details" table — one line per skill + agent
- Choose-resource-shape decision (collection vs singleton — short summary only)
- NuxtHub specifics that are not covered by any skill
- Output expectations / tone for Claude responses

Not allowed in `PROJECT_INSTRUCTIONS.md`:
- Full hard-rule lists (live in AGENTS.md)
- Convention details (live in the relevant skill)
- TypeScript gotchas (live in api skill)

`CONTRIBUTING.md` is the human-facing onboarding doc and should not reference AI
agents or Claude. It covers: local setup, the four-layer diagram, PR checklist,
and where to find code examples.

---

## §5 Script / CI hardening

### Bare-string `removeItem` check

Add to `scripts/check-conventions.sh` (in the singleton section):

```bash
section "singleton cache purge uses constant (not bare string)"
bad=$(grep -rn "removeItem('" server/api --include='*.ts' 2>/dev/null || true)
if [ -n "$bad" ]; then
  fail "singleton write handler calls removeItem with a bare string — use the CACHE_STORAGE_KEY constant:"
  printf '%s\n' "$bad" | indent
fi
```

### Pre-commit hook for `gen:rate-limits`

Document in `CONTRIBUTING.md`:

```bash
# one-time setup
echo 'node scripts/gen-rate-limits.mjs && git add RATE_LIMITS.md' \
  > .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

### `.env.example` drift in local script

Mirror CI step 10 in `check-conventions.sh`:

```bash
section ".env.example covers all used env vars"
# Collect vars referenced in nuxt.config.ts and server/ files
used=$(grep -rhoE 'process\.env\.[A-Z_]+|runtimeConfig\.[a-zA-Z]+' \
  nuxt.config.ts server/ --include='*.ts' 2>/dev/null \
  | sort -u)
# Check each against .env.example
while IFS= read -r var; do
  key=$(echo "$var" | sed 's/process\.env\.//; s/runtimeConfig\./NUXT_/')
  if ! grep -q "^$key=" .env.example 2>/dev/null; then
    note "$key used in code but missing from .env.example"
  fi
done <<< "$used"
```

---

## §6 Definition of done (per-phase)

Run these after every phase's PR:

```bash
npx nuxt typecheck
npm run build
npm run conventions          # must exit 0, zero warnings
npm run gen:rate-limits      # must produce no diff: git diff RATE_LIMITS.md
```

Then invoke the `refactor-auditor` agent with the branch name. It should report
zero findings against the phase's scope before merging.

---

## Relationship to other skills

- **api skill** — canonical source for handler shape, presenter, validation rules.
  Refactor skill defers to it on anything HTTP-layer related.
- **database skill** — canonical source for schema, migration, and query patterns.
  Refactor skill does not change migrations.
- **auth / rbac / rate-limit / account-security skills** — off-limits for refactor
  PRs. Security-touching code gets its own focused review.
- **convention-reviewer agent** — run it against every PR, refactor or feature.
- **refactor-auditor agent** — run it before opening a refactor PR to generate
  the finding list this skill then resolves.