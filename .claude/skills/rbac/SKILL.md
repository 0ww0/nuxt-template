---
name: rbac
description: Handles role-based authorization in this Nuxt 4 + NuxtHub project — defining roles, the privilege ladder, and gating routes/handlers by role. Use it to add or change a role, require a minimum role (hierarchical) or an exact role (orthogonal) on a server handler, gate a page with the client role middleware, assign roles safely without mass-assignment, and avoid privilege escalation. Built on shared/auth/roles.ts (the single source of truth) and the server guards in server/utils/auth.ts (requireRole / requireMinRole, throwing forbidden 403). Trigger on casual phrasing too ("make this admin-only", "require super_admin", "add a role", "gate this endpoint by role", "why can an admin not reach the super_admin route", "403 vs 401", "can a user set their own role"). For who-is-logged-in / sessions / password hashing use the auth skill; for tables/columns/migrations use the database skill; for general endpoint shape use the api skill; for org/tenant scoping use the tenancy skill (next topic).
---

# RBAC Skill — roles & authorization

The authorization layer of this project. It sits **on top of** auth: auth answers
*who are you?* (a logged-in `User`), RBAC answers *are you allowed?* (does that
user's role clear the bar). Like auth, it does **not** add a new architectural
layer — it threads role checks through the existing one, and the same hard rules
hold: the **edge enforces**, services stay HTTP-agnostic.

## The one thing to get right: authentication vs authorization, 401 vs 403

| Question | Helper | Failure |
|---|---|---|
| Are you logged in? | `requireUser(event)` | **401** (`unauthorized`) |
| Are you *exactly* one of these roles? | `requireRole(event, ...roles)` | **403** (`forbidden`) |
| Are you *this role or higher*? | `requireMinRole(event, min)` | **403** (`forbidden`) |

All three live in `server/utils/auth.ts` (the EDGE/HTTP layer). They resolve the
user from the **session cookie → DB**, never from anything the client sends in a
body or header. That is the real authorization boundary. The client-side role
middleware is UX only (see §3).

```
handler   → requireUser / requireRole / requireMinRole   (HTTP only; 401/403 here)
service   → role-agnostic business rules; takes an explicit actor arg if it needs one
repository→ the only layer importing @nuxthub/db
```

Never hand-write `if (!session) throw 401` or `if (user.role !== 'admin') throw 403`
in a handler — call the guard. It centralizes the rule and keeps the "Nitro/edge
handles status codes" property the 405 and 401 rules rely on.

---

## §0 Prerequisites

RBAC builds directly on the auth topic. Before using this skill you need:

1. A `role` column on `users`: `role: text('role').$type<UserRole>().notNull().default('user')`.
   Note the `$type<UserRole>()` cast is a **compile-time** constraint only — the
   DB column is plain `text`. Integrity relies on the app only ever writing values
   from `ROLES` (see §4). For defense-in-depth you *could* add a PG enum or CHECK
   constraint, but the template enforces it in the application layer.
2. The session → user resolution from the auth skill (`getCurrentUser` /
   `requireUser` in `server/utils/auth.ts`).
3. `forbidden` (403) in `server/utils/errors.ts`, mirroring `unauthorized`/`notFound`:
   ```ts
   export const forbidden = (message = 'Forbidden') =>
     createError({ statusCode: 403, statusMessage: message })
   ```

---

## §1 The role model — `shared/auth/roles.ts` (single source of truth)

Roles are defined once in `shared/` so the DB schema (`$type`), Zod contracts,
server guards, and the client all stay in sync. Add a role here and nothing else
has to change shape.

```ts
// shared/auth/roles.ts
export const ROLES = ['user', 'admin', 'super_admin'] as const
export type UserRole = (typeof ROLES)[number]

// Privilege ladder. Higher number = more privilege, so a higher role inherits
// everything below it — a super_admin clears any admin check automatically.
export const ROLE_RANK: Record<UserRole, number> = {
  user: 0,
  admin: 1,
  super_admin: 2,
}

export function roleAtLeast(role: UserRole, min: UserRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[min]
}
```

**To add a role:** add the string to `ROLES`, give it a rank in `ROLE_RANK`, done.
No migration is needed for the role *value* itself — it's just another string in
the existing `text` column. (You only re-seed to create accounts with the new role.)

---

## §2 Server-side enforcement (the real boundary)

Two guards, two different shapes of question. Pick by whether your roles form a
**ladder** or are **orthogonal**.

```ts
// server/utils/auth.ts  (EDGE / HTTP layer)

// Ladder check — "this rank OR ABOVE". Use this for sensitive actions.
export async function requireMinRole(event: H3Event, min: UserRole): Promise<User> {
  const user = await requireUser(event)
  if (!roleAtLeast(user.role, min)) throw forbidden()
  return user
}

// Exact / orthogonal check — "one of EXACTLY these". No call args → just "logged in".
export async function requireRole(event: H3Event, ...roles: UserRole[]): Promise<User> {
  const user = await requireUser(event)
  if (roles.length > 0 && !roles.includes(user.role)) throw forbidden()
  return user
}
```

**Prefer `requireMinRole` for privilege ladders.** With flat equality,
`requireRole(event, 'admin')` would reject a `super_admin` (wrong — they outrank
admins). `requireMinRole(event, 'admin')` encodes "this rank or above" once, so
you never hand-list every superior role at each call site. Reach for `requireRole`
only when roles are genuinely orthogonal (e.g. `support` vs `billing` — neither
outranks the other).

Each guard **returns the resolved `User`**, so use it in place of `requireUser`:

```ts
// server/api/v1/admin/overview.get.ts
export default defineEventHandler(async (event) => {
  const admin = await requireMinRole(event, 'admin') // super_admin inherits
  return { admin: presentAuthUserV1(admin), message: 'Welcome to the admin area.' }
})
```

---

## §3 Client-side guards are UX, NOT security

The client role middleware (`layers/1.auth/app/middleware/role.ts`) and the
`useAuth` helpers (`hasRole`, `hasMinRole`) only show/hide UI and redirect. They
run in the user's browser and are trivially bypassable. **Every privileged server
endpoint must still call its own `requireMinRole`/`requireRole`.**

Opt a page in via meta — `minRole` (hierarchical, preferred) or `requiredRole`
(exact, single or array):

```ts
definePageMeta({
  layout: 'admin',
  middleware: 'role',
  minRole: 'admin', // admin or higher; or:  requiredRole: ['support', 'billing']
})
```

The middleware redirects anonymous users to `/login?redirect=…` and throws a
client-side 403 for insufficient role. Mirror the server guard's intent here so
the UX matches what the API will allow — but treat the server check as the source
of truth.

---

## §4 Assigning roles safely (the escalation-sensitive path)

Privilege escalation almost always sneaks in through **mass-assignment**. Two
non-negotiable rules:

1. **Public contracts never carry `role`.** `registerV1Schema` deliberately has no
   `role` field, and the service defaults it: `role: input.role ?? 'user'`. Even
   if an attacker POSTs `{ "role": "admin" }`, Zod strips/rejects it and they land
   as `'user'`. Roles are only ever set by **trusted internal callers** — the
   seeder, or a future admin "set role" endpoint.
2. **Any role-mutating PATCH uses `.strict()` and is gated.** An admin "update user"
   endpoint must use a `.partial().strict()` body (so a regular user patching their
   own profile can't slip `role` in) AND guard the write with
   `requireMinRole(event, 'admin')` (or higher). `.strict()` blocks the
   mass-assignment; the guard blocks the unauthorized actor. You need both.

The seeder is a trusted caller, so it *may* pass `role` directly:

```ts
await authService.register({ email: 'super@example.com', name: 'Super Admin',
  password: superPassword, role: 'super_admin' })
```

---

## §5 Gate a resource (recipe)

To make an existing handler role-protected, add **one guard line** as the first
statement — no other layer changes:

```ts
// server/api/v1/info/index.patch.ts
export default defineEventHandler(async (event) => {
  await requireMinRole(event, 'super_admin') // anon → 401, below super_admin → 403
  const body = await readValidatedBody(event, updateInfoV1Schema.parse)
  return presentInfoV1((await infoService.upsert(body))!)
})
```

Decide the gate per operation, not per resource:
- **Writes gated, reads open** is the common default (the `info` singleton: `POST`/
  `PATCH` require `super_admin`; `GET` stays public).
- **Read also sensitive?** Add `requireMinRole(event, 'admin')` to the `.get.ts` too.
- **Whole path gated?** Prefer a small Nitro route middleware over repeating the
  guard on every handler, when *every* method needs the same minimum role.

Keep the guard in the **handler**. Do not push role logic into the service — that
would make the service touch HTTP and break the shared-across-versions rule. If a
service genuinely needs to know the actor, pass `user.id` / `user.role` as an
explicit argument from the handler (mirrors the auth skill's actor-explicit hand-off).

---

## §6 TypeScript & gotchas

- `user.role` is typed `UserRole` via the schema's `$type<UserRole>()` cast, so
  `roleAtLeast(user.role, min)` is type-safe and `requireRole(event, 'amin')` is a
  compile error (typo caught). Keep guard args as `UserRole` literals, never raw
  strings.
- Guards **return the `User`** — assign the result (`const admin = await requireMinRole(...)`)
  instead of calling `requireUser` again; a second call re-resolves the session.
- Adding a role to `ROLES` without adding it to `ROLE_RANK` is a type error
  (`Record<UserRole, number>` becomes incomplete) — the compiler forces you to
  rank every role. Good.
- The role is read off the **DB-backed** user resolved from the session, never from
  the request. Don't add `role` to anything the client controls. Don't trust a
  `role` claim from a body/header/query.
- Never expand a presenter to leak more than intended. `presentAuthUserV1` exposes
  `role` (the client needs it for UX), but a table holding a secret still hand-lists
  fields and omits the secret — RBAC doesn't change the auth skill's presenter rule.

---

## §7 Definition of done
- [ ] Role added to `ROLES` **and** `ROLE_RANK` in `shared/auth/roles.ts` (if new).
- [ ] `forbidden` (403) present in `server/utils/errors.ts`.
- [ ] Privileged handlers call `requireMinRole`/`requireRole` as their first line;
      no `if (role !== …)` hand-rolled in handlers.
- [ ] `requireMinRole` used for ladders; `requireRole` reserved for orthogonal roles.
- [ ] No public contract accepts `role`; role-mutating PATCH uses `.partial().strict()`
      and is itself guarded.
- [ ] Client `role` middleware mirrors the server intent (UX), but every protected
      endpoint enforces server-side too.
- [ ] Presenters don't leak secrets; `role` exposure is intentional.
- [ ] Seeder creates accounts for each role for testing.
- [ ] `npx nuxt typecheck` passes.

## Relationship to the other docs
- **auth skill** — identity: sessions, `requireUser`, password hashing. RBAC starts
  where auth ends (a resolved `User` with a `role`).
- **api skill** — endpoint shape, validation (`.strict()`), presenters, status codes.
  The 401/403 here are the auth/authz counterpart of its 405/201/204 rules.
- **database skill** — the `role` column + any future enum/CHECK constraint.
- **AGENTS.md** — its "Auth-aware resources" note points here when a resource must
  be role-gated.
- **tenancy skill** (next topic) — scopes authorization *within* a tenant. RBAC is
  "what role"; tenancy is "in which org" — they compose (e.g. `admin` **of tenant X**).
