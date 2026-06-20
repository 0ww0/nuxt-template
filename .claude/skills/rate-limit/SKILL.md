---
name: rate-limit
description: Handles request rate limiting and brute-force lockout in this Nuxt 4 + NuxtHub project — throttling abusive traffic, protecting the auth endpoints (login, register, password reset, MFA verify), and returning 429s with a Retry-After. Implemented as a FULL layered slice — a Postgres `rate_limit_attempts` table, a repository with an atomic upsert, a policy service, and an edge util `checkRateLimit(event, action, policy, accountKey?)` called as the first line of sensitive handlers (NOT global middleware, NOT KV). Use it to add or tune a limit on an endpoint, add a per-account bucket, set a lockout, prune stale buckets, or move the store to Redis. Trigger on casual phrasing too ("rate limit the login", "stop brute force", "429 too many requests", "lock the account after N tries", "throttle this endpoint", "limit password-reset requests"). For session/credential logic use the auth skill; for role-gating use the rbac skill; for endpoint shape use the api skill. NOT infrastructure DDoS protection (that's Caddy / a CDN / fail2ban) — this is application-layer abuse defense.
---

# Rate-Limit Skill — DB-backed throttling & lockout

A normal **layered vertical slice** (schema → repository → service), plus a thin
**edge util** the handlers call. Unlike CSRF — which is global Nitro middleware in
`server/middleware/csrf.ts` — rate limiting is invoked **per handler** as an
explicit first line. That's deliberate: each endpoint sets its own policy, and the
login route in particular must throttle **before** it runs scrypt, so password
hashing can't be abused as a CPU amplifier.

It protects the endpoints the auth skill built (login/register/reset/MFA), which
are the classic brute-force and credential-stuffing targets.

> **Scope.** Application-layer abuse defense — enough to blunt credential stuffing,
> account-targeted brute force, and signup spam. **Not** DDoS protection; defend
> volumetric attacks at the infrastructure layer (Caddy, a CDN/WAF, fail2ban). Keep
> both — different threats.

## The one thing to get right: atomicity + the two-bucket strategy

1. **The hit is atomic.** The repository's `hit()` is a single
   `INSERT … ON CONFLICT DO UPDATE` with a `CASE` expression that resets the count
   when the window expired and increments otherwise — **in one statement**. This
   removes the read-decide-write (TOCTOU) race where two concurrent requests at a
   window boundary both reset to `count = 1` and slip past the threshold. Never
   reintroduce a separate read-then-write counter.
2. **Two buckets per sensitive action.** Every protected action is limited on two
   keys independently:
   - `"<action>:ip:<ip>"` — catches distributed stuffing (many accounts, one host).
   - `"<action>:account:<key>"` — catches account-targeted brute force (one account,
     rotating IPs). The account bucket uses a **tighter** limit (half the IP limit).
   Either bucket tripping causes a lockout.

```
schema   server/db/schema/rateLimitAttempt.ts     rate_limit_attempts table
repo     server/repositories/rateLimitAttempt.repository.ts   atomic hit() / lockBucket() — ONLY layer with @nuxthub/db
service  server/services/rateLimit.service.ts      check(bucket, policy) → { allowed, retryAfter? }; owns policy, not HTTP
util     server/utils/rateLimit.ts                 checkRateLimit(event, action, policy, accountKey?) → resolves IP, runs both buckets, sets Retry-After, throws 429
handler  await checkRateLimit(event, 'login', {...}, email)    first line, before any DB / scrypt work
```

---

## §0 Setup (once)

1. **`tooManyRequests` (429) in `server/utils/errors.ts`** takes the retry time as a
   **`Date`** (the util turns it into an HTTP-date header):
   ```ts
   export const tooManyRequests = (retryAfter?: Date) =>
     createError({ statusCode: 429, statusMessage: 'Too many requests', data: { retryAfter } })
   ```
2. **`rate_limit_attempts` table** + barrel re-export (see §1), then `npm run db:generate`.
3. **Schedule the cleanup task** (see §6) so stale buckets are pruned.

---

## §1 The table — `server/db/schema/rateLimitAttempt.ts`

One row per bucket. The window is fixed and tracked by `windowStart`; `blockedUntil`
is the lockout.

```ts
export const rateLimitAttempts = pgTable('rate_limit_attempts', {
  id: serial('id').primaryKey(),
  bucket: text('bucket').notNull().unique(),         // "login:ip:1.2.3.4" / "login:account:a@b.com"
  count: integer('count').notNull().default(1),       // attempts in the current window
  windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
  blockedUntil: timestamp('blocked_until', { withTimezone: true }), // nullable; set on lockout
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull().defaultNow().$onUpdate(() => new Date()),
})
export type RateLimitAttempt = typeof rateLimitAttempts.$inferSelect
```

The `bucket` unique constraint is what makes the upsert in §2 work.

---

## §2 The repository — atomic by construction (the crux)

All DB access for rate limiting lives here. Two write methods carry the correctness.

- **`hit(bucket, windowMs)`** — `INSERT … ON CONFLICT (bucket) DO UPDATE` where the
  `SET` uses `CASE WHEN windowStart + windowMs <= now() THEN <reset> ELSE <increment>`
  for `count`, `windowStart`, and `blockedUntil` (cleared on a fresh window). One
  statement, no race. Returns the updated row (`return row!` — upsert always yields
  one).
- **`lockBucket(bucket, until, threshold)`** — `UPDATE … SET blocked_until = until
  WHERE bucket = ? AND count > threshold`. The `count > threshold` guard means a
  concurrent request that already reset the window **won't** get a stale lock
  applied. Returns whether a row was locked.
- `findByBucket` (fast-path read) and `deleteBucket` (cleanup/tests) round it out.

Do not add a plain "read count, then write count+1" path — it's exactly the race
the upsert exists to avoid.

---

## §3 The service — policy, HTTP-agnostic

`rateLimitService.check(bucket, policy)` owns the decision; it never touches `event`
or throws HTTP errors. Policy fields (all optional, with defaults):
`windowMs` (15 min), `maxAttempts` (10), `lockoutMs` (15 min).

Flow: (1) **fast-path** `findByBucket` — if `blockedUntil` is in the future, return
`{ allowed: false, retryAfter }` without writing (pure optimization; correctness
doesn't depend on it). (2) `hit()` atomically. (3) if `count > maxAttempts`,
`lockBucket(...)` for `lockoutMs` and return blocked. Else `{ allowed: true }`.

Returns `{ allowed: boolean; retryAfter?: Date }` — a `Date`, not seconds.

---

## §4 The edge util — `checkRateLimit` (what handlers call)

`checkRateLimit(event, action, policy, accountKey?)` is the only HTTP-aware piece.
It:

- Resolves the client IP with `getRequestIP(event, { xForwardedFor: true })`
  (trusted because Caddy is in front — see §7). If IP is unknown it **logs a warning
  and skips the IP bucket** — it does **not** fall back to a shared `"unknown"`
  bucket, which would collapse all anonymous traffic into one bucket and lock
  everyone out.
- Runs the **IP bucket** at the given policy, and (if `accountKey` is passed) the
  **account bucket** at **half** `maxAttempts`.
- On a block, sets `Retry-After` (an **HTTP-date** via `retryAfter.toUTCString()`)
  and throws `tooManyRequests(retryAfter)`.

Call it as the **first line** of the handler, before any DB or crypto work:

```ts
// server/api/v1/auth/login.post.ts
const { email, password } = await readValidatedBody(event, loginV1Schema.parse)
// Rate-limit BEFORE scrypt so password hashing can't be used as a CPU amplifier.
await checkRateLimit(event, 'login', { maxAttempts: 10, windowMs: 15 * 60_000, lockoutMs: 15 * 60_000 }, email)
const result = await authService.login(email, password)
```

---

## §5 Policy per protected action (current)

| Action (`action` key) | Account bucket? | IP policy | Notes |
|---|---|---|---|
| `login` | yes (email) | 10 / 15 min, 15 min lockout | account bucket auto-tightens to 5 |
| `register` | by email if present | low ceiling | kills automated signups |
| forgot/reset password | usually IP-only | low ceiling | no account key needed; don't leak existence |
| `mfa` verify | yes (user/email) | tight | OTP guessing is the threat |

When adding a new limited endpoint: pick an `action` name, choose `maxAttempts`/
`windowMs`/`lockoutMs`, pass an `accountKey` when the action targets one account, and
call `checkRateLimit` first. Nothing else changes.

---

## §6 Pruning — the scheduled cleanup task

`server/tasks/auth/cleanup.ts` is a Nitro scheduled task (hourly via
`nitro.scheduledTasks` in `nuxt.config.ts`; ad-hoc with `npx nuxt task run auth:cleanup`)
that deletes stale `rate_limit_attempts` (window long closed **and** not currently
locked) alongside expired sessions, password-reset tokens, email-verification
tokens, and MFA codes.

> **Documented architectural exception:** this task imports `@nuxthub/db` directly,
> which the "only repositories import `@nuxthub/db`" rule forbids. It is an **accepted
> one-off** — maintenance-only, never called from routes/services, and bulk-deleting
> expired rows across five tables doesn't warrant five repository methods. **Do not
> use it as precedent**; everything reachable from a route/service still goes through
> a repository.

---

## §7 Security & correctness conventions (non-negotiable)

- **Limit before expensive work.** On login, `checkRateLimit` runs before
  `authService.login` (scrypt). Otherwise an attacker forces costly hashing on every
  attempt — the limiter becomes a DoS amplifier instead of a defense.
- **Trust the proxy IP, but verify Caddy overwrites `X-Forwarded-For`.** With
  `xForwardedFor: true`, a client-supplied XFF is trusted unless the proxy strips it.
  This is the most common rate-limit bypass. (Bare-metal / no proxy → use
  `{ xForwardedFor: false }`.)
- **Never use a shared fallback bucket** for unknown IPs — log and skip instead, or
  one missing header locks out everyone.
- **`Retry-After` is an HTTP-date**, produced from the `retryAfter` `Date`. Keep the
  service returning a `Date`, not delta-seconds.
- **Lockout ≠ window exhaustion.** Exceeding `maxAttempts` sets `blockedUntil`
  (`lockoutMs`), which rejects even after the window would have rolled. The `hit()`
  CASE clears it only on a genuinely new window.
- **No enumeration.** Password-reset / login limits must not change the response by
  whether the account exists (mirror the auth skill's generic-failure rule).

---

## §8 Scaling beyond Postgres
The DB table is consistent across Nitro instances and restarts with **no external
dependency** — the right default here. Because all rate-limit logic is isolated in
the repository + service, you can later swap the store to Redis (atomic `INCR`,
key TTLs) **without touching the service interface, the util, or any handler**.

---

## §9 Definition of done
- [ ] `tooManyRequests(retryAfter?: Date)` (429) in `errors.ts`.
- [ ] `rate_limit_attempts` table + barrel re-export + migration.
- [ ] Repository `hit()` is a single atomic upsert; `lockBucket()` is guarded by
      `count > threshold`. No read-then-write counter anywhere.
- [ ] Service `check()` returns `{ allowed, retryAfter?: Date }`; owns policy, no HTTP.
- [ ] `checkRateLimit` runs IP + (optional) half-limit account bucket, sets
      `Retry-After`, throws `tooManyRequests`; no shared `unknown` bucket.
- [ ] Sensitive handlers call `checkRateLimit` **before** DB/crypto work.
- [ ] Cleanup task scheduled; its `@nuxthub/db` exception left documented, not copied.
- [ ] IP via `getRequestIP(event, { xForwardedFor: true })`; Caddy confirmed to
      overwrite `X-Forwarded-For`.
- [ ] `npx nuxt typecheck` passes.

## Relationship to the other docs
- **auth skill** — the login/register/reset/MFA endpoints this guards; the
  generic-error / no-enumeration rule it must preserve.
- **rbac skill** — orthogonal: rbac decides *who may*, rate-limit decides *how often*.
- **api skill** — endpoint shape and status codes (429 joins 401/403/405).
- **database skill** — the `rate_limit_attempts` table, the atomic-upsert pattern, and
  the cleanup task's bulk deletes.
- **csrf** (`server/middleware/csrf.ts`) — the other edge protection; global middleware,
  whereas rate limiting is per-handler. Read both to see when each shape applies.
