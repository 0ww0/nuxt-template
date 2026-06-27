---
name: rbac
description: Handles role-based authorization in this Nuxt 4 + NuxtHub project — defining roles, the privilege ladder, and gating routes/handlers by role. Use it to add or change a role, require a minimum role (hierarchical) or an exact role (orthogonal) on a server handler, gate a page with the client role middleware, assign roles safely without mass-assignment, guard a role-change endpoint with assertCanAssignRole, require email verification with requireVerifiedUser, and avoid privilege escalation. Built on shared/auth/roles.ts (the single source of truth) and the server guards in server/utils/auth.ts. Trigger on casual phrasing too ("make this admin-only", "require super_admin", "add a role", "gate this endpoint by role", "why can an admin not reach the super_admin route", "403 vs 401", "can a user set their own role", "gate on verified email"). For who-is-logged-in / sessions / password hashing use the auth skill; for tables/columns/migrations use the database skill; for general endpoint shape use the api skill; for org/tenant scoping use the tenancy skill.
---

# RBAC Skill — roles & authorization

The authorization layer of this project. Auth answers *who are you?* (a logged-in
`User`); RBAC answers *are you allowed?* (does that user's role clear the bar).
It does **not** add a new architectural layer — role checks thread through the
existing one, and the same hard rules hold: the **edge enforces**, services stay
HTTP-agnostic.

## The one thing to get right: authentication vs authorization, 401 vs 403

| Question | Helper | Failure |
|---|---|---|
| Are you logged in? | `requireUser(event)` | **401** (`unauthorized`) |
| Are you *exactly* one of these roles? | `requireRole(event, ...roles)` | **403** (`forbidden`) |
| Are you *this role or higher*? | `requireMinRole(event, min)` | **403** (`forbidden`) |
| Logged in AND email verified? | `requireVerifiedUser(event)` | **401** or **403** |
| Can actor assign this role? | `assertCanAssignRole(actor, role)` | **403** |

All live in `server/utils/auth.ts` (the EDGE/HTTP layer). They resolve the user
from the **session cookie → DB**, never from anything the client sends. That is
the real authorization boundary.

```
handler   → requireUser / requireRole / requireMinRole / requireVerifiedUser   (HTTP; 401/403)
service   → role-agnostic business rules; takes explicit actor arg if it needs one
repository→ the only layer importing @nuxthub/db
```

Never hand-write `if (user.role !== 'admin') throw 403` — call the guard.

---

## §0 Prerequisites

1. A `role` column on `users`: `role: text('role').$type<UserRole>().notNull().default('user')`.
2. A DB-level `CHECK` constraint built from the `ROLES` constant (see `server/db/schema/user.ts`). This prevents rogue SQL from writing an arbitrary role string even if it bypasses the ORM. Adding a new role requires a ROLES update **and** a `db:generate` migration.
3. The session → user resolution from the auth skill (`getCurrentUser` / `requireUser` in `server/utils/auth.ts`).
4. `forbidden` (403) in `server/utils/errors.ts`:
   ```ts
   export function forbidden(message = 'You do not have permission to do that') {
     return createError({ statusCode: 403, statusMessage: message })
   }
   ```

---

## §1 The role model — `shared/auth/roles.ts` (single source of truth)

```ts
export const ROLES = ['user', 'admin', 'super_admin'] as const
export type UserRole = (typeof ROLES)[number]

export const ROLE_RANK: Record<UserRole, number> = {
  user: 0,
  admin: 1,
  super_admin: 2,
}

export function roleAtLeast(role: UserRole, min: UserRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[min]
}
```

**To add a role:** add the string to `ROLES`, give it a rank in `ROLE_RANK`, run
`npm run db:generate` (the CHECK constraint changes). No other files need updating —
the compiler will catch any `Record<UserRole, number>` gaps for you.

---

## §2 Server-side enforcement (the real boundary)

```ts
// server/utils/auth.ts

// Ladder check — "this rank OR ABOVE". Use for sensitive actions.
export async function requireMinRole(event: H3Event, min: UserRole): Promise<User>

// Exact / orthogonal check — "one of EXACTLY these".
export async function requireRole(event: H3Event, ...roles: UserRole[]): Promise<User>

// Logged in AND email verified. Use to gate actions on a confirmed address.
// Checks requireUser first (401 if anon), then emailVerifiedAt (403 if null).
export async function requireVerifiedUser(event: H3Event): Promise<User>

// Role-assignment cap: actor may never grant a role above their own rank.
// Call alongside requireMinRole on any endpoint that creates or changes a role.
export function assertCanAssignRole(actor: User, role: UserRole): void
```

**Prefer `requireMinRole` for privilege ladders.** `requireRole(event, 'admin')`
rejects a `super_admin` (wrong). `requireMinRole(event, 'admin')` passes both.
Use `requireRole` only for genuinely orthogonal roles.

Guards **return the resolved `User`** — assign the result instead of calling
`requireUser` again:

```ts
const admin = await requireMinRole(event, 'admin')   // super_admin inherits
return { admin: presentAuthUserV1(admin) }
```

---

## §3 Client-side guards are UX, NOT security

`layers/1.auth/app/middleware/role.ts` and `useAuth` helpers (`hasRole`,
`hasMinRole`) only redirect and show/hide UI. Every privileged server endpoint
still needs its own guard.

Opt a page in via meta:

```ts
definePageMeta({
  layout: 'admin',
  middleware: 'role',
  minRole: 'admin', // admin or higher; or: requiredRole: ['support', 'billing']
})
```

Mirror the server guard's intent so UX matches what the API will allow — but treat
the server check as the source of truth.

---

## §4 Assigning roles safely

**Mass-assignment is the classic escalation vector. Two non-negotiable rules:**

1. **Public contracts never carry `role`.** `registerV1Schema` has no `role` field;
   the service defaults it to `'user'`. Even if an attacker POSTs `{ "role": "admin" }`,
   Zod's `.strict()` rejects it. Roles are only ever set by trusted internal callers
   (seeder, admin endpoints).
2. **Role-mutating endpoints use `.strict()` AND are gated AND call `assertCanAssignRole`.**
   - `.strict()` blocks mass-assignment.
   - `requireMinRole(event, 'admin')` (or higher) blocks unauthorized actors.
   - `assertCanAssignRole(actor, role)` prevents an admin from minting a `super_admin`.
   You need all three.

**Role mutation lives on its own isolated route:**

```ts
// server/api/v1/users/[id]/role.patch.ts — super_admin only
export default defineEventHandler(async (event) => {
  const actor = await requireMinRole(event, 'super_admin')
  const { id } = await getValidatedRouterParams(event, paramsSchema.parse)
  const { role } = await readValidatedBody(event, setRoleV1Schema.parse)
  return presentUserV1(await userService.setRole(actor, id, role))
})
```

`setRoleV1Schema` is a dedicated, single-purpose schema (`.strict()`, `role`
required) so `role` can never ride along in the generic profile PATCH.

**Service-level rank enforcement (defense-in-depth):**

`userService.setRole(actor, targetId, newRole)` enforces independently of the
edge gate:
- No self-role-change
- Can't assign above the actor's own rank
- Can't modify a user who outranks the actor
- Can't demote the last `super_admin`

Pass the full `actor` object from the handler to the service.

**Admin user creation:**

```ts
// POST /api/v1/users — admin-only
const actor = await requireMinRole(event, 'admin')
const body  = await readValidatedBody(event, createUserV1Schema.parse)
assertCanAssignRole(actor, body.role ?? 'user')   // caps at actor's own rank
const user  = await authService.register(body)
```

---

## §5 Gate a resource (recipe)

Add one guard line as the handler's first statement:

```ts
// Writes gated, reads open (common pattern for singletons)
export default defineEventHandler(async (event) => {
  await requireMinRole(event, 'super_admin') // anon → 401, below super_admin → 403
  const body = await readValidatedBody(event, updateInfoV1Schema.parse)
  return presentInfoV1(await infoService.save(body))
})
```

Decide per operation, not per resource:
- **Writes gated, reads open** — the default for the five settings singletons.
- **Read also sensitive?** Add `requireMinRole(event, 'admin')` to the `.get.ts` too.
- **Whole path gated?** Use a small Nitro route middleware when every method needs the same minimum role.
- **Email verification required?** Use `requireVerifiedUser(event)` instead of `requireUser`.

Keep the guard in the **handler**. Never push role logic into the service. If the
service needs to know the actor, pass `user.id` / `user.role` as explicit arguments.

---

## §6 TypeScript & gotchas

- `user.role` is typed `UserRole` via `$type<UserRole>()` — `requireRole(event, 'amin')` is a compile error. Keep guard args as `UserRole` literals.
- Guards return the `User` — assign the result; don't call `requireUser` again.
- Adding a role to `ROLES` without adding it to `ROLE_RANK` is a compile error (`Record<UserRole, number>` becomes incomplete). The compiler forces you to rank every role.
- The role is read off the **DB-backed** user from the session, never from the request body/header/query.
- `requireVerifiedUser` is for actions that must not run for unconfirmed addresses (403 if `emailVerifiedAt` is null). Authentication (401) is still checked first.
- Never expand a presenter to leak more than intended. `presentAuthUserV1` exposes `role` (client needs it for UX), but a record holding secrets still hand-lists fields.

---

## §7 Definition of done
- [ ] Role added to `ROLES` **and** `ROLE_RANK` in `shared/auth/roles.ts` (if new); `db:generate` run to update the CHECK constraint.
- [ ] `forbidden` (403) present in `server/utils/errors.ts`.
- [ ] Privileged handlers call `requireMinRole`/`requireRole` as their first line.
- [ ] `requireMinRole` used for ladders; `requireRole` reserved for orthogonal roles.
- [ ] No public contract accepts `role`; profile PATCH uses `.partial().strict()`; role-change endpoint isolated on its own route.
- [ ] Role-assignment endpoints call both `requireMinRole` (edge gate) and `assertCanAssignRole` (rank cap).
- [ ] Role mutation/deletion services take an explicit `actor` object and enforce rank rules.
- [ ] Client `role` middleware mirrors server intent (UX); server check is the boundary.
- [ ] Presenters don't leak secrets; `role` exposure is intentional.
- [ ] Seeder creates accounts for each role for testing.
- [ ] `npx nuxt typecheck` passes.

## Relationship to the other docs
- **auth skill** — identity: sessions, `requireUser`, password hashing. RBAC starts where auth ends.
- **api skill** — endpoint shape, validation (`.strict()`), presenters, status codes.
- **database skill** — the `role` column, CHECK constraint, and migrations when roles change.
- **AGENTS.md** — "Auth-aware resources" section covers the actor-explicit hand-off.
- **account-security skill** — `requireVerifiedUser` pairs with email verification.