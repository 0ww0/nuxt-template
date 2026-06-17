---
name: auth
description: Handles authentication and sessions in this Nuxt 4 + NuxtHub project — signup/register, login, logout, the current-user ("me") endpoint, password hashing, server-side sessions, and reading the logged-in user inside a handler. Built on a DB-backed `sessions` table (an opaque token in a hardened httpOnly cookie) with node:crypto scrypt password hashing — NOT nuxt-auth-utils, not JWT. Use it to add auth endpoints, gate a resource behind a login, hash/verify credentials in the service layer, resolve the current user, revoke sessions (logout / "log everyone out"), and avoid leaking password hashes through presenters. Trigger on casual phrasing too ("add login", "protect this endpoint", "who is the current user", "hash the password", "require auth", "sign out everywhere", "why is the session empty"). For role-gating (admin-only, super_admin-only) use the rbac skill; for tables/columns/migrations use the database skill; for general endpoint shape use the api skill; for org/tenant scoping use the tenancy skill (next topic).
---

# Auth Skill — sessions & credentials

The identity layer of this project. It answers *who are you?* (a logged-in
`User`); the rbac skill answers *are you allowed?*. Auth does **not** introduce a
new architectural layer — it threads through the existing one, and the hard rules
still hold: cookies/status codes at the edge, business rules in the service,
queries in the repository.

This project uses **server-side sessions**, not `nuxt-auth-utils` sealed cookies
and not JWTs. The cookie carries only an **opaque random token**; the real session
row lives in the DB and is looked up on every request. Deleting that row (logout /
revoke) invalidates the session instantly — the concrete win over stateless tokens.

## The one thing to get right: which layer owns which piece

| Piece | Touches `event`? | Lives in |
|---|---|---|
| `setSessionCookie`, `clearSessionCookie`, `getCurrentUser`, `requireUser` | **yes** (cookie I/O) | **route handler / edge** (`server/utils/auth.ts`) |
| `sessionService.create` / `resolve` / `revoke` / `revokeAllForUser` (token gen, TTL policy) | no | **service** (`session.service.ts`) |
| `hashPassword` / `verifyPassword` (scrypt; module-private) | no (pure crypto) | **service** (`auth.service.ts`) |
| `findByToken`, `findByEmail`, user/session inserts | n/a (queries) | **repository** |

So the layered flow for "log in" is:

```
handler   → validate → authService.login → sessionService.create → setSessionCookie  (HTTP/cookie only)
service   → verifyPassword, uniqueness, TTL; throws unauthorized/conflict
repository→ findByEmail, insert session   (the only layer importing @nuxthub/db)
```

`requireUser(event)` throws **401 automatically** when there's no/expired session —
the same "let the edge handle it, don't hand-write it" property the 405 rule relies
on. Never write your own `if (!session) throw 401` in a handler.

---

## §0 Setup (once)

There is **no auth module to install** — sessions are plain DB rows and password
hashing uses the built-in `node:crypto`. (No `nuxt-auth-utils`, no
`NUXT_SESSION_PASSWORD`: the cookie holds a random token, not encrypted state, so
there is no app-level session secret to configure.)

1. **Columns on `users`** (database skill): `email` (unique), `name`, `role`
   (`text` notNull default `'user'`), and `passwordHash` — **nullable** `text`
   (so seeded demo users without credentials can exist and simply can't log in).
2. **`sessions` table** — `token` (unique), `userId` (FK → `users.id`,
   `onDelete: 'cascade'`), `expiresAt`, `createdAt`. See §1.
3. **Error helpers** in `server/utils/errors.ts`: `unauthorized` (401) and
   `forbidden` (403), mirroring `notFound`/`conflict`:
   ```ts
   export const unauthorized = (message = 'Unauthorized') =>
     createError({ statusCode: 401, statusMessage: message })
   export const forbidden = (message = 'Forbidden') =>
     createError({ statusCode: 403, statusMessage: message })
   ```
   (`forbidden` is consumed by the rbac skill's role guards.)
4. Run `npm run db:generate`; the dev server auto-applies the migration.

---

## §1 The session model

The cookie value is an opaque token; everything else is a DB row.

```ts
// server/db/schema/session.ts
export const sessions = pgTable('sessions', {
  id: serial('id').primaryKey(),
  token: text('token').notNull().unique(),          // what lives in the cookie
  userId: integer('user_id').notNull()
    .references(() => users.id, { onDelete: 'cascade' }), // delete user → sessions go too
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
```

**Lifecycle (service)** — TTL is a business policy, so it lives in the service, not
a handler:

```ts
// server/services/session.service.ts
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30 // 30 days

create(userId)  → token = randomBytes(32).toString('base64url'); insert {token,userId,expiresAt}
resolve(token)  → findByToken → if expired, delete + return null (self-healing prune) → else {user, session}
revoke(token)   → delete one session   (logout)
revokeAllForUser(userId) → delete all  ("sign out everywhere" / after password change)
```

`resolve` returns **`null`** (not an error) for the common anonymous/expired case so
callers can treat anonymous as valid; the **edge** decides whether that's a 401.

**Cookie (edge)** — `server/utils/auth.ts` owns cookie I/O and the hardening that
forms the CSRF defense:

```ts
export const SESSION_COOKIE = 'session'
setCookie(event, SESSION_COOKIE, token, {
  httpOnly: true,            // JS can't read it → blocks token theft via XSS
  secure: !import.meta.dev,  // HTTPS-only in production
  sameSite: 'lax',           // first line of CSRF defense
  path: '/',
  expires: expiresAt,
})
```

`getCurrentUser(event)` = `sessionService.resolve(getCookie(event, SESSION_COOKIE))`;
`requireUser(event)` wraps it and throws `unauthorized()` when it's `null`.

---

## §2 The four endpoints (`server/api/v1/auth/`)

All thin: validate → service → cookie → present. Bodies validate against
`shared/schemas/v1/auth.schema.ts` (`loginV1Schema` / `registerV1Schema`; password
`min(8).max(200)`; **register has no `role` field** — role is server-assigned).

| Route | Does | Status |
|---|---|---|
| `register.post.ts` | `authService.register` (409 if email taken) → `sessionService.create` → `setSessionCookie` | **201** |
| `login.post.ts` | `authService.login` (401 on bad creds) → `sessionService.create` → `setSessionCookie` | 200 |
| `logout.post.ts` | `sessionService.revoke(cookieToken)` → `clearSessionCookie` | **204 + `return null`** |
| `me.get.ts` | `requireUser(event)` → present | 200 / **401** |

```ts
// register.post.ts — create an account (role 'user') and sign in
export default defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, registerV1Schema.parse)
  const user = await authService.register(body)        // 409 if email taken
  const session = await sessionService.create(user.id)
  setSessionCookie(event, session.token, session.expiresAt)
  setResponseStatus(event, 201)
  return presentAuthUserV1(user)
})

// me.get.ts — the current user; 401 if not authenticated
export default defineEventHandler(async (event) => {
  return presentAuthUserV1(await requireUser(event))
})
```

**Password hashing (service, scrypt).** `hashPassword`/`verifyPassword` are
module-private helpers in `auth.service.ts` — no extra dependency:

```ts
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
// store:  `${salt.toString('hex')}:${scryptSync(pw, salt, 64).toString('hex')}`
// verify: re-derive with the stored salt, compare with timingSafeEqual (length-guarded)
```

> Runtime note: `scryptSync` needs a **Node** runtime (this template's Docker image
> runs `node-server`). On a pure edge/serverless runtime, swap to a Web Crypto
> PBKDF2 implementation — same `salt:hash` storage shape, same service boundary.

---

## §3 Owned / logged-in-only resources (actor hand-off)

To gate another resource behind a login, do **not** put session logic in its
service. In the handler, resolve the user at the edge and pass the id down as an
explicit argument:

```ts
const user = await requireUser(event)          // 401 if absent
return postService.create(user.id, body)       // service stays actor-explicit
```

Keep the service signature actor-explicit (`create(ownerId, input)`) so the tenancy
layer can later swap `user.id` for the active `tenantId` without touching callers.
For **role**-gating (not just logged-in), use `requireMinRole`/`requireRole`
instead — see the **rbac skill**.

---

## §4 Security conventions (non-negotiable)

- **Generic auth failures.** Unknown email and wrong password both throw the *same*
  `unauthorized('Invalid email or password')` (401) — no user enumeration.
- **Never present `passwordHash`.** `presentAuthUserV1` is **hand-listed**
  (`id, name, email, role, created_at`), so the hash can't be serialized even by
  accident. Any table holding a secret must hand-list its presenter — never spread.
- **The cookie holds only an opaque token.** No user data, no encrypted state — the
  user is re-hydrated from the DB by `sessionService.resolve` on every request. This
  is what makes revocation instant; keep it that way (don't start stuffing claims
  into the cookie).
- **Cookie hardening is the CSRF posture.** `httpOnly` + `secure` (prod) +
  `sameSite: 'lax'`. Keep all three.
- **Password length.** Floor 8, ceiling 200 chars (a DoS guard) in the Zod schema.
  (scrypt has no bcrypt-style 72-byte truncation, so there is no 72-byte cap here.)
- **Revoke on sensitive change.** After a password reset or forced logout, call
  `sessionService.revokeAllForUser(userId)` so old tokens die.

---

## §5 TypeScript & gotchas

- `sessionService.resolve(...)` / `getCurrentUser(...)` return **`null`** when logged
  out — branch on `null`, don't assume a user. Use `requireUser` when presence is
  mandatory (it does the 401 for you).
- The `User` type is the Drizzle row (`typeof users.$inferSelect`), inferred from the
  schema. There is **no `#auth-utils` augmentation** to maintain (that was the
  nuxt-auth-utils approach). If `User.role` looks wrong, check the `$type<UserRole>()`
  cast on the column, not a type-augmentation file.
- `user.passwordHash` is `string | null` (nullable column). `login` guards
  `!user.passwordHash` so credential-less seeded users can't authenticate — keep
  that null-check if you touch login.
- `INSERT … RETURNING` is `T | undefined` under `noUncheckedIndexedAccess`; the
  repositories use `return created!` for always-one-row inserts (see the api skill's
  TS section).
- **Client:** use `useAuth()` (from the `1.auth` layer), *not* `useUserSession()`.
  `fetchUser()` uses `useRequestFetch()` so the cookie is forwarded during SSR and
  the user is known on first render (no auth flicker). Reuse
  `shared/schemas/v1/auth.schema.ts` for the login/register forms.

---

## §6 Definition of done
- [ ] `users` has `email` (unique), `role`, and **nullable** `passwordHash`;
      `sessions` table added (token unique, `userId` FK cascade, `expiresAt`).
- [ ] `unauthorized` (401) + `forbidden` (403) in `errors.ts`.
- [ ] Cookie I/O + `requireUser` only at the edge; session lifecycle in
      `sessionService`; `hash`/`verify` only in `authService`.
- [ ] `register` (201) / `login` / `logout` (204 + `return null`) / `me` (401)
      wired; bodies validated by the shared v1 schema; `register` rejects `role`.
- [ ] `presentAuthUserV1` omits `passwordHash`.
- [ ] Login failures are generic 401s (no enumeration).
- [ ] Cookie is `httpOnly` + `secure` (prod) + `sameSite: 'lax'`.
- [ ] `npx nuxt typecheck` passes.

## Relationship to the other docs
- **database skill** — the `users` columns + `sessions` table + migration (below this).
- **api skill** — endpoint shape, validation, presenters, status codes (beside this).
- **rbac skill** — `requireRole`/`requireMinRole` (also in `server/utils/auth.ts`) and
  the `role` model. Auth gives you a logged-in `User`; rbac decides what that role may do.
- **AGENTS.md** — when a CRUD resource must be auth-protected/owned, its
  "Auth-aware resources" note points back here.
- **tenancy skill** (next topic) — scopes the `user.id` hand-off in §3 to a tenant.
