---
name: auth
description: Handles authentication and sessions in this Nuxt 4 + NuxtHub project — signup/register, login, logout, the current-user ("me") endpoint, password hashing, server-side sessions, and reading the logged-in user inside a handler. Built on a DB-backed `sessions` table (an opaque token in a hardened httpOnly cookie) with node:crypto async scrypt password hashing — NOT nuxt-auth-utils, not JWT. Use it to add auth endpoints, gate a resource behind a login, hash/verify credentials in the service layer, resolve the current user, revoke sessions (logout / "log everyone out"), and avoid leaking password hashes through presenters. Trigger on casual phrasing too ("add login", "protect this endpoint", "who is the current user", "hash the password", "require auth", "sign out everywhere", "why is the session empty", "MFA login flow"). For role-gating (admin-only, super_admin-only) use the rbac skill; for password reset / email verify / MFA use the account-security skill; for tables/columns/migrations use the database skill; for general endpoint shape use the api skill.
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
| `sessionService.create` / `resolve` / `revoke` / `revokeAllForUser` | no | **service** (`session.service.ts`) |
| `hashPassword` / `verifyPassword` (async scrypt; module-private) | no (pure crypto) | **service** (`auth.service.ts`) |
| `mfaPreAuthService.issueToken` / `validateToken` / `consumeToken` | no | **service** (`mfaPreAuth.service.ts`) |
| `findByTokenWithUser`, `findByEmail`, user/session inserts | n/a (queries) | **repository** |

Layered flow for "log in":
```
handler   → validate → checkRateLimit → authService.login → sessionService.create → setSessionCookie
service   → verifyPassword (async scrypt), decoy hash for timing equalization; throws unauthorized/conflict
repository→ findByEmail, findByTokenWithUser (join), insert session  (the only layer importing @nuxthub/db)
```

`requireUser(event)` throws **401 automatically** when there's no/expired session.
Never write your own `if (!session) throw 401` in a handler.

---

## §0 Setup (once)

No auth module to install — sessions are plain DB rows, hashing uses `node:crypto`.

**Columns on `users`** (database skill):
- `email` (unique, case-insensitive index via migration addendum)
- `name` (notNull)
- `role` (`text` notNull default `'user'`, with DB CHECK constraint)
- `passwordHash` — **nullable** `text` (seeded demo users without credentials can exist; `login` guards `!user.passwordHash`)
- `emailVerifiedAt` — nullable `timestamp` (null = unverified; set by email-verify flow)
- `mfaEnabled` — `boolean` notNull default `false` (toggled by MFA enable/disable)

**`sessions` table** — `token` (unique), `userId` (FK → `users.id`, `onDelete: 'cascade'`), `expiresAt`, `createdAt`, plus a `sessions_user_id_idx` index on `userId` (Postgres doesn't auto-index FKs; without this `revokeAllForUser` and the user-delete cascade do full table scans).

**Error helpers** in `server/utils/errors.ts`:
```ts
export const unauthorized = (message = 'Authentication required') =>
  createError({ statusCode: 401, statusMessage: message })
export const forbidden = (message = 'You do not have permission to do that') =>
  createError({ statusCode: 403, statusMessage: message })
```

Run `npm run db:generate`; the dev server auto-applies the migration.

---

## §1 The session model

The cookie value is an opaque token; everything else is a DB row.

```ts
// server/db/schema/session.ts
export const sessions = pgTable(
  'sessions',
  {
    id:        serial('id').primaryKey(),
    token:     text('token').notNull().unique(),
    userId:    integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  // Index the FK — Postgres does NOT auto-index FK columns.
  // Without this, revokeAllForUser and the user-delete cascade scan the whole table.
  (t) => [index('sessions_user_id_idx').on(t.userId)],
)
```

**Lifecycle (service)** — TTL is a business policy, so it lives in the service:
```ts
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30 // 30 days

create(userId)           → token = randomBytes(32).toString('base64url'); insert {token,userId,expiresAt}
resolve(token)           → findByTokenWithUser (one join round-trip) → if expired: delete + return null
                           → if user missing (orphaned session): delete + return null → else { user, session }
revoke(token)            → deleteByToken (logout)
revokeAllForUser(userId) → deleteByUserId ("sign out everywhere" / after password change)
```

`resolve` uses `findByTokenWithUser` — a **single left-join query** that fetches the session and its user in one round-trip (the per-request hot path). It handles two self-healing prune cases: an expired session (deleted, returns null) and an orphaned session where the user row is gone but the FK cascade didn't fire (deleted, returns null). `resolve` returns **`null`** for all "no valid session" cases — the edge decides whether that's a 401.

**Cookie (edge)**:
```ts
setCookie(event, SESSION_COOKIE, token, {
  httpOnly: true,           // blocks XSS token theft
  secure: !import.meta.dev, // HTTPS-only in production
  sameSite: 'lax',          // CSRF first line of defense
  path: '/',
  expires: expiresAt,
})
```

---

## §2 The auth endpoints (`server/api/v1/auth/`)

All thin: validate → `checkRateLimit` → service → cookie → present. Bodies validate against `shared/schemas/v1/auth.schema.ts`.

| Route | Does | Status |
|---|---|---|
| `register.post.ts` | `checkRateLimit` → `authService.register` (409 if email taken) → `sessionService.create` → `setSessionCookie` | **201** |
| `login.post.ts` | `checkRateLimit` → `authService.login` → if MFA: issue `mfa_preauth` cookie + return `{ mfa_required: true }` (no session, no userId in body); else `sessionService.create` → `setSessionCookie` | **200** |
| `logout.post.ts` | `sessionService.revoke(cookieToken)` → `clearSessionCookie` | **204 + `return null`** |
| `me.get.ts` | `requireUser(event)` → `presentAuthUserV1(user)` | 200 / **401** |

**Login MFA branch** — when `user.mfaEnabled`, `authService.login` returns `{ mfaRequired: true, userId }`. The handler calls `mfaPreAuthService.issueToken(userId)`, sets a short-lived `httpOnly` `mfa_preauth` cookie scoped to `/api/v1/auth/mfa`, and responds `{ mfa_required: true }` — **no session cookie, no userId in the response body**. The client then calls `/api/v1/auth/mfa/send` (no body needed — cookie carries the binding) and `/api/v1/auth/mfa/verify { code }` to complete login. See the **account-security skill** for the full MFA flow.

**Password hashing** — uses **async** `scrypt` via `promisify` (runs on the libuv threadpool, does not block the event loop). `scryptSync` would serialize all concurrent login attempts; never use it here.

```ts
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
const scryptAsync = promisify(scrypt)

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const derived = await scryptAsync(password, salt, 64)
  return `${salt.toString('hex')}:${(derived as Buffer).toString('hex')}`
}
```

**Decoy hash (timing equalization)** — a module-level pre-computed hash is burned against unknown emails so a missing account takes the same time as a real one. Never remove this; it prevents account enumeration via response latency:
```ts
const decoyHashPromise = hashPassword(randomBytes(32).toString('hex'))
// In login: if (!user || !user.passwordHash) { await verifyPassword(password, await decoyHashPromise); throw unauthorized(...) }
```

---

## §3 Owned / logged-in-only resources (actor hand-off)

To gate another resource behind a login, do **not** put session logic in its service. In the handler, resolve the user at the edge and pass the id down:

```ts
const user = await requireUser(event)       // 401 if absent
return postService.create(user.id, body)    // service stays actor-explicit
```

Keep the service signature actor-explicit (`create(ownerId, input)`) so the tenancy layer can later swap `user.id` for the active `tenantId` without touching callers. For **role**-gating use `requireMinRole`/`requireRole` — see the **rbac skill**.

---

## §4 Security conventions (non-negotiable)

- **Generic auth failures.** Unknown email, missing password hash, and wrong password all throw the *same* `unauthorized('Invalid email or password')` (401). The decoy hash ensures identical timing.
- **Never present `passwordHash`.** `presentAuthUserV1` is **hand-listed** and explicitly omits the hash. It exposes `email_verified` (bool) and `mfa_enabled` (bool) so the client can update its UI without a separate `/me` fetch.
- **The cookie holds only an opaque token.** No user data, no encrypted state — re-hydrated from DB on every request. This makes revocation instant.
- **Cookie hardening is the CSRF posture.** `httpOnly` + `secure` (prod) + `sameSite: 'lax'`. Keep all three.
- **Password length.** Floor 8, ceiling 200 chars in the Zod schema (DoS guard; async scrypt has no 72-byte truncation issue).
- **Revoke on sensitive change.** After password reset or forced logout, call `sessionService.revokeAllForUser(userId)`.
- **Rate-limit register and login** (see rate-limit skill) — both call `checkRateLimit` before the scrypt work.

---

## §5 TypeScript & gotchas

- `sessionService.resolve(...)` / `getCurrentUser(...)` return **`null`** when logged out. Use `requireUser` when presence is mandatory.
- The `User` type is `typeof users.$inferSelect` — no `#auth-utils` augmentation to maintain.
- `user.passwordHash` is `string | null` — `login` guards `!user.passwordHash` so credential-less seeded users can't authenticate. Keep that check.
- `user.emailVerifiedAt` is `Date | null` — null means unverified. `presentAuthUserV1` converts this to a boolean `email_verified`.
- `authService.login` returns `User | { mfaRequired: true; userId: number }` — narrow with `'mfaRequired' in result` before accessing either branch.
- `hashPassword` / `verifyPassword` are **async** — always `await` them.
- `sessionRepository.findByTokenWithUser` returns `{ session: Session; user: User | null } | undefined` — the `user` field can be null for an orphaned session; `sessionService.resolve` self-heals both cases before returning.
- **Client:** use `useAuth()` (from the `1.auth` layer), not `useUserSession()`. `fetchUser()` uses `useRequestFetch()` so the cookie is forwarded during SSR (no auth flicker). The `AuthUser` interface mirrors `presentAuthUserV1` shape including `email_verified` and `mfa_enabled`.

---

## §6 Definition of done
- [ ] `users` has `email` (unique), `name`, `role` (CHECK constraint), **nullable** `passwordHash`, nullable `emailVerifiedAt`, boolean `mfaEnabled`; `sessions` table with `sessions_user_id_idx` index added.
- [ ] `unauthorized` (401) + `forbidden` (403) in `errors.ts`.
- [ ] Cookie I/O + `requireUser` only at the edge; session lifecycle in `sessionService`; async hash/verify only in `authService`.
- [ ] `register` (201) / `login` / `logout` (204 + `return null`) / `me` (401) wired; bodies validated by shared v1 schema; `register` never accepts `role`.
- [ ] `checkRateLimit` called before scrypt on `register` and `login`.
- [ ] `login` MFA branch: issues `mfa_preauth` httpOnly cookie + returns `{ mfa_required: true }` with no session cookie and no `user_id` in the body.
- [ ] Decoy hash in place for timing equalization on unknown email.
- [ ] `presentAuthUserV1` hand-lists fields; omits `passwordHash`; includes `email_verified` and `mfa_enabled`.
- [ ] Login failures are generic 401s (no enumeration, same latency).
- [ ] Cookie is `httpOnly` + `secure` (prod) + `sameSite: 'lax'`.
- [ ] `npx nuxt typecheck` passes.

## Relationship to the other docs
- **account-security skill** — password reset, email verification, MFA enable/disable/send/verify (including the pre-auth cookie flow). Extends auth; don't duplicate here.
- **database skill** — the `users` columns + `sessions` table + migration.
- **api skill** — endpoint shape, validation, presenters, status codes.
- **rbac skill** — `requireRole`/`requireMinRole`/`requireVerifiedUser` and the `role` model. Auth gives you a logged-in `User`; rbac decides what that role may do.
- **rate-limit skill** — `checkRateLimit` called on login/register before scrypt.
- **AGENTS.md** — "Auth-aware resources" covers the actor-explicit hand-off for owned resources.