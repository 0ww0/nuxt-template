---
name: auth
description: Handles authentication and sessions in this Nuxt 4 + NuxtHub project — signup/register, login, logout, the current-user ("me") endpoint, password hashing, protecting routes, and reading the logged-in user inside a handler. Built on nuxt-auth-utils (sealed-cookie sessions, by the NuxtHub author). Use it to add auth endpoints, gate an existing resource behind a session, hash/verify credentials in the service layer, augment session types, and avoid leaking password hashes through presenters. Trigger on casual phrasing too ("add login", "protect this endpoint", "who is the current user", "hash the password", "require auth", "why is the session empty"). For tables/columns/migrations use the database skill; for general endpoint shape use the api skill; for org/tenant scoping use the tenancy skill (next topic). Per-tenant authorization (roles) is the RBAC skill, not this one.
---

# Auth Skill — sessions & credentials

The identity layer of this project. It does **not** introduce a new architectural
layer — it threads through the existing one. The whole skill is about putting
each auth helper in the correct layer so the hard rules still hold.

## The one thing to get right: which layer owns which helper

`nuxt-auth-utils` auto-imports its helpers into `server/`. Split them by whether
they touch the HTTP `event`:

| Helper | Touches `event`? | Lives in |
|---|---|---|
| `setUserSession`, `getUserSession`, `requireUserSession`, `clearUserSession`, `replaceUserSession` | **yes** | **route handler** (HTTP layer) |
| `hashPassword`, `verifyPassword` | no (pure crypto) | **service** (HTTP-agnostic) |
| credential lookup (`findByEmail`) | n/a (query) | **repository** |

So the layered flow is unchanged:

```
handler   → requireUserSession / setUserSession / clearUserSession  (HTTP only)
service   → hashPassword / verifyPassword, uniqueness, throws unauthorized/conflict
repository→ findByEmail, create   (the only layer importing @nuxthub/db)
```

`requireUserSession(event)` sends **401 automatically** when there's no session —
the same "Nitro handles it, don't hand-write it" property the 405 rule relies on.
Never write your own `if (!session) throw 401` in a handler.

---

## §0 Setup (once)

1. Add the module: `npx nuxi module add auth-utils` (adds `nuxt-auth-utils` to
   the `modules` array in `nuxt.config.ts`). This is a normal Nuxt module — unlike
   `@nuxthub/db`, you DO list it here.
2. Add a session secret (32+ chars) to `.env` / `.env.example`:
   `NUXT_SESSION_PASSWORD=<32+ random chars>`. Sessions are encrypted into sealed
   cookies with this; rotating it logs everyone out.
3. Augment the session types in `shared/types/auth.d.ts` so `user` is typed
   everywhere:
   ```ts
   declare module '#auth-utils' {
     interface User { id: number; email: string } // identifiers only — see §4
     interface UserSession { /* extra non-secret fields if needed */ }
     interface SecureSessionData { /* server-only secrets, never sent to client */ }
   }
   export {}
   ```

---

## §1 Schema additions (defer to the database skill)

Auth extends the existing `users` table — it is **not** a new resource shape.
Add two columns to `server/db/schema/user.ts`, then generate a migration via the
database skill (§2/§3 there):

- `email: text('email').notNull().unique()`
- `passwordHash: text('password_hash').notNull()`

`passwordHash` is a secret: it is persisted, but it must NEVER appear in any
presenter output (§4).

---

## §2 The auth slice

Auth routes are unversioned-by-convention session plumbing, but still live under
a version folder for consistency: `server/api/v1/auth/`. Four handlers:

| Route | Method | Does |
|---|---|---|
| `/api/v1/auth/register` | `register.post.ts` | create user → open session → 201 |
| `/api/v1/auth/login` | `login.post.ts` | verify creds → open session |
| `/api/v1/auth/logout` | `logout.post.ts` | clear session → 204 |
| `/api/v1/auth/me` | `me.get.ts` | return the current user |

**Schemas** (`shared/schemas/v1/auth.schema.ts`) — shared with the client:
```ts
import { z } from 'zod'

export const registerV1Schema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(72), // 72 = bcrypt byte ceiling; keep it explicit
}).strict()

export const loginV1Schema = registerV1Schema
export type RegisterV1 = z.infer<typeof registerV1Schema>
```

**Repository** — add to `server/repositories/user.repository.ts` (do NOT create
an `auth.repository.ts`; auth queries the users table):
```ts
findByEmail(email: string): Promise<User | undefined> {
  return db.query.users.findFirst({ where: eq(schema.users.email, email) })
},
```

**Service** (`server/services/auth.service.ts`) — HTTP-agnostic. `hashPassword`
/`verifyPassword` are auto-imported in `server/`, so no explicit import:
```ts
import { userRepository } from '../repositories/user.repository'
import { conflict, unauthorized } from '../utils/errors'

export const authService = {
  async register(input: { email: string; password: string }) {
    if (await userRepository.findByEmail(input.email)) throw conflict('Email already registered')
    const passwordHash = await hashPassword(input.password)
    return userRepository.create({ email: input.email, passwordHash })
  },
  async login(input: { email: string; password: string }) {
    const user = await userRepository.findByEmail(input.email)
    // Verify even when the user is missing is optional; either way throw the SAME
    // generic error so you don't leak which emails exist (§4).
    if (!user || !(await verifyPassword(user.passwordHash, input.password))) {
      throw unauthorized('Invalid credentials')
    }
    return user
  },
}
```

**Handlers** — thin; the session calls are the HTTP concern:
```ts
// register.post.ts
export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, registerV1Schema.parse)
  const user = await authService.register(body)
  await setUserSession(event, { user: { id: user.id, email: user.email } })
  setResponseStatus(event, 201)
  return presentUserV1(user)
})

// login.post.ts
export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, loginV1Schema.parse)
  const user = await authService.login(body)
  await setUserSession(event, { user: { id: user.id, email: user.email } })
  return presentUserV1(user)
})

// logout.post.ts
export default defineEventHandler(async (event) => {
  await clearUserSession(event)
  setResponseStatus(event, 204)
  return null
})

// me.get.ts
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event) // 401 if no session
  return user
})
```

**Presenter rule (critical):** `presentUserV1` hand-lists fields and MUST omit
`passwordHash`. The presenter is the security boundary against leaking the hash —
a spread-everything presenter on the users table is a vulnerability here.

---

## §3 Protecting any other resource

To gate an existing collection/singleton endpoint behind auth, add one line at
the top of the handler and pass the identity *into* the service — never let the
service read the session itself (that would make it touch HTTP):

```ts
export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)         // 401 if absent
  const body = await readValidatedBody(event, createPostV1Schema.parse)
  return presentPostV1(await postService.create(user.id, body)) // ownership passed in
})
```

This `user.id` hand-off is the exact seam the **tenancy** skill plugs into next
(swap `user.id` for the active `tenantId`). Keep services taking an explicit
owner/actor argument so that change is local.

---

## §4 Security conventions (non-negotiable)

- **Generic auth failures.** Login with a bad email and a bad password return the
  *same* `unauthorized('Invalid credentials')` (401). Don't reveal whether an
  email exists — no user enumeration.
- **Never present `passwordHash`** (or any `*Secret`/token column). Hand-list
  presenter fields for any table that holds a secret.
- **Session holds identifiers only.** Sealed cookies cap at ~4096 bytes. Store
  `{ id, email }` (later `tenantId`, `role`), not the whole user. Re-hydrate the
  full record from the DB when a handler needs it.
- **New error helper.** Add `unauthorized` (401) to `server/utils/errors.ts`,
  mirroring the existing `notFound`/`conflict`:
  ```ts
  export const unauthorized = (message = 'Unauthorized') =>
    createError({ statusCode: 401, statusMessage: message })
  ```
  (RBAC will add `forbidden` (403) — leave that for the RBAC skill.)
- **Password length.** Cap at 72 bytes in the Zod schema (bcrypt truncates beyond
  that); floor at 8.

---

## §5 TypeScript & gotchas

- `getUserSession(event)` returns `{}` (no `user`) when logged out — branch on
  `session.user`, don't assume it exists. Use `requireUserSession` when presence
  is mandatory.
- The `user` shape comes from your `#auth-utils` augmentation (§0); if `user` is
  typed `unknown`, the `shared/types/auth.d.ts` declaration is missing or not
  picked up — re-run `nuxt prepare`.
- `setUserSession` **merges**; `replaceUserSession` overwrites. Use replace when
  switching the active tenant later, so stale fields don't linger.
- Client side: `const { user, loggedIn, clear } = useUserSession()`. Reuse the
  same `shared/schemas/v1/auth.schema.ts` for the login/register forms.

---

## §6 Definition of done
- [ ] `nuxt-auth-utils` in `modules`; `NUXT_SESSION_PASSWORD` in `.env.example`.
- [ ] `email` (unique) + `passwordHash` columns added and migrated.
- [ ] Session helpers only in handlers; `hash`/`verify` only in the service.
- [ ] `authService` HTTP-agnostic; throws `unauthorized`/`conflict`.
- [ ] `presentUserV1` omits `passwordHash`.
- [ ] Login failures are generic 401s (no enumeration).
- [ ] `unauthorized` added to `errors.ts`; `#auth-utils` types augmented.
- [ ] `npx nuxt typecheck` passes.

## Relationship to the other docs
- **database skill** — the `email`/`passwordHash` columns + migration (below this).
- **api skill** — endpoint shape, validation, presenters, status codes (beside this).
- **AGENTS.md** — when a CRUD resource must be auth-protected/owned, see its
  "Auth-aware resources" note, which points back here.
- **tenancy skill** (next topic) — scopes the `user.id` hand-off in §3 to a tenant.
