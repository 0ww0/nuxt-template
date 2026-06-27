---
name: rate-limit
description: Handles request rate limiting and brute-force lockout in this Nuxt 4 + NuxtHub project — throttling abusive traffic, protecting the auth endpoints (login, register, password reset, MFA verify), and returning 429s with a Retry-After. Implemented as a FULL layered slice — a Postgres `rate_limit_attempts` table, a repository with an atomic upsert, a policy service, and an edge util `checkRateLimit(event, action, policy, accountKey?)` called as the first line of sensitive handlers (NOT global middleware, NOT KV). Use it to add or tune a limit on an endpoint, add a per-account bucket, set a lockout, prune stale buckets, or move the store to Redis. Trigger on casual phrasing too ("rate limit the login", "stop brute force", "429 too many requests", "lock the account after N tries", "throttle this endpoint", "limit password-reset requests"). For session/credential logic use the auth skill; for role-gating use the rbac skill; for endpoint shape use the api skill. NOT infrastructure DDoS protection (that's Caddy / a CDN / fail2ban) — this is application-layer abuse defense.
---

# Rate-Limit Skill — DB-backed throttling & lockout

A normal **layered vertical slice** (schema → repository → service), plus a thin **edge util** the handlers call. Unlike CSRF — which is global Nitro middleware in `server/middleware/csrf.ts` — rate limiting is invoked **per handler** as an explicit first line. Each endpoint sets its own policy; the login route must throttle **before** it runs scrypt, so password hashing can't be abused as a CPU amplifier.

> **Scope.** Application-layer abuse defense. **Not** DDoS protection — defend volumetric attacks at the infrastructure layer (Caddy, a CDN/WAF, fail2ban). Keep both.

## The one thing to get right: atomicity + the two-bucket strategy

1. **The hit is atomic.** The repository's `hit()` is a single `INSERT … ON CONFLICT DO UPDATE` with a `CASE` expression — reset-or-increment in one statement. No read-decide-write race. Never reintroduce a separate counter.
2. **Two buckets per sensitive action:** `"<action>:ip:<ip>"` (distributed stuffing) and `"<action>:account:<key>"` (targeted brute force at half the IP limit). Either tripping causes a lockout.

```
schema   server/db/schema/rateLimitAttempt.ts
repo     server/repositories/rateLimitAttempt.repository.ts   atomic hit() / lockBucket()
service  server/services/rateLimit.service.ts                 check(bucket, policy) → { allowed, retryAfter? }
util     server/utils/rateLimit.ts                            checkRateLimit(event, action, policy, accountKey?)
handler  await checkRateLimit(event, 'login', {...}, email)   first line, before any DB / scrypt work
```

---

## §0 Setup (once)

1. **`tooManyRequests` (429) in `server/utils/errors.ts`**:
   ```ts
   export function tooManyRequests(retryAfter?: Date) {
     const msg = retryAfter
       ? `Too many requests. Try again after ${retryAfter.toUTCString()}.`
       : 'Too many requests. Please slow down.'
     return createError({ statusCode: 429, statusMessage: msg })
   }
   ```
2. **`rate_limit_attempts` table** + barrel re-export (see §1), then `npm run db:generate`.
3. **Schedule the cleanup task** (see §6) so stale buckets are pruned.

---

## §1 The table — `server/db/schema/rateLimitAttempt.ts`

```ts
export const rateLimitAttempts = pgTable('rate_limit_attempts', {
  id:           serial('id').primaryKey(),
  bucket:       text('bucket').notNull().unique(),       // "login:ip:1.2.3.4"
  count:        integer('count').notNull().default(1),
  windowStart:  timestamp('window_start', { withTimezone: true }).notNull(),
  blockedUntil: timestamp('blocked_until', { withTimezone: true }),
  updatedAt:    timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
                .$onUpdate(() => new Date()),
})
export type RateLimitAttempt = typeof rateLimitAttempts.$inferSelect
```

---

## §2 The repository — atomic by construction

- **`hit(bucket, windowMs)`** — single `INSERT … ON CONFLICT DO UPDATE` with a `CASE` that resets on window expiry or increments otherwise. Returns `row!` (upsert always yields one row).
- **`lockBucket(bucket, until, threshold)`** — `UPDATE … SET blocked_until = until WHERE count > threshold`. The guard prevents a concurrent window-reset from applying a stale lock.
- `findByBucket` (fast-path read) and `deleteBucket` (cleanup/tests) round it out.

Do not add a plain "read count, then write count+1" path — it's the race the upsert exists to eliminate.

---

## §3 The service — policy, HTTP-agnostic

`rateLimitService.check(bucket, policy)` owns the decision; never touches `event`. Defaults: `windowMs` 15 min, `maxAttempts` 10, `lockoutMs` 15 min.

Flow: (1) fast-path `findByBucket` — if `blockedUntil > now`, return blocked (optimization, not a correctness dependency). (2) `hit()` atomically. (3) if `count > maxAttempts`, `lockBucket(...)` and return blocked. Else `{ allowed: true }`.

Returns `{ allowed: boolean; retryAfter?: Date }` — a `Date`, not seconds.

---

## §4 The edge util — `checkRateLimit`

`checkRateLimit(event, action, policy, accountKey?)` is the only HTTP-aware piece. It resolves the client IP with `getRequestIP(event, { xForwardedFor: true })` (trusted because Caddy is in front). If IP is unknown it logs a warning and **skips** the IP bucket — never falls back to a shared `"unknown"` bucket. Runs IP bucket (given policy) and, if `accountKey` is passed, account bucket at **half** `maxAttempts`. On block: sets `Retry-After` (HTTP-date) and throws `tooManyRequests(retryAfter)`.

Call it as the **first line** of the handler, before any DB or crypto work:

```ts
const { email, password } = await readValidatedBody(event, loginV1Schema.parse)
// Rate-limit BEFORE scrypt so hashing can't be used as a CPU amplifier.
await checkRateLimit(event, 'login', { maxAttempts: 10, windowMs: 15 * 60_000, lockoutMs: 15 * 60_000 }, email)
const result = await authService.login(email, password)
```

---

## §5 Policy per protected action (current)

The full current table is in **`RATE_LIMITS.md`** (auto-generated — see §9 DoD). Key entries:

| Action | IP policy | Account bucket |
|---|---|---|
| `login` | 10 / 15 min, 15 min lockout | email (5 / 15 min) |
| `register` | 10 / 60 min, 60 min lockout | — |
| `forgot-password` | 5 / 60 min, 60 min lockout | email (3 / 60 min) |
| `reset-password` | 20 / 60 min, 60 min lockout | — |
| `verify-email` | 20 / 60 min, 60 min lockout | — |
| `resend-verify` | 3 / 60 min, 60 min lockout | userId (2 / 60 min) |
| `mfa-send` | 3 / 10 min, 30 min lockout | userId (2 / 10 min) |
| `mfa-verify` | 10 / 10 min, 30 min lockout | userId (5 / 10 min) |

When adding a new limited endpoint: pick an `action` name, choose policy values, pass an `accountKey` when targeting one account, call `checkRateLimit` first, then **run `npm run gen:rate-limits` and commit the updated `RATE_LIMITS.md`**.

---

## §6 Pruning — the scheduled cleanup task

`server/tasks/auth/cleanup.ts` is a Nitro scheduled task (hourly via `nitro.scheduledTasks` in `nuxt.config.ts`; ad-hoc with `npx nuxt task run auth:cleanup`). It prunes:

1. Expired sessions
2. Expired password-reset tokens
3. Expired email-verification tokens
4. Expired MFA OTP codes
5. Expired MFA pre-auth tokens (`mfa_preauth_tokens`)
6. Stale rate-limit buckets (window closed AND not currently locked)

> **Documented architectural exception:** this task imports `@nuxthub/db` directly. It is an **accepted one-off** — maintenance-only, never called from routes/services. Do not use as precedent.

---

## §7 Security & correctness conventions

- **Limit before expensive work.** `checkRateLimit` before `authService.login` (scrypt). Otherwise the limiter becomes a DoS amplifier.
- **Trust the proxy IP, but verify Caddy overwrites `X-Forwarded-For`.** With `xForwardedFor: true`, a client-supplied XFF is trusted. Bare-metal / no proxy → `{ xForwardedFor: false }`.
- **Never use a shared fallback bucket** for unknown IPs — log and skip.
- **`Retry-After` is an HTTP-date** from `retryAfter.toUTCString()`. Keep the service returning a `Date`, not delta-seconds.
- **Lockout ≠ window exhaustion.** `blockedUntil` rejects even after the window would have rolled.
- **No enumeration.** Password-reset / login limits must not change the response based on account existence.

---

## §8 Scaling beyond Postgres

All rate-limit logic is isolated in the repository + service. Swap the store to Redis later without touching the service interface, the util, or any handler.

---

## §9 Definition of done
- [ ] `tooManyRequests(retryAfter?: Date)` (429) in `errors.ts` using `export function`.
- [ ] `rate_limit_attempts` table + barrel re-export + migration.
- [ ] Repository `hit()` is a single atomic upsert; `lockBucket()` guarded by `count > threshold`. No read-then-write counter anywhere.
- [ ] Service `check()` returns `{ allowed, retryAfter?: Date }`; owns policy, no HTTP.
- [ ] `checkRateLimit` runs IP + (optional) half-limit account bucket, sets `Retry-After`, throws `tooManyRequests`; no shared `unknown` bucket.
- [ ] Sensitive handlers call `checkRateLimit` **before** DB/crypto work.
- [ ] Cleanup task prunes all 6 tables; its `@nuxthub/db` exception left documented, not copied.
- [ ] IP via `getRequestIP(event, { xForwardedFor: true })`; Caddy confirmed to overwrite `X-Forwarded-For`.
- [ ] **`npm run gen:rate-limits` run and `RATE_LIMITS.md` committed** alongside any `checkRateLimit` call change. CI fails on stale file.
- [ ] `npx nuxt typecheck` passes.

## Relationship to the other docs
- **auth skill** — the login/register/reset/MFA endpoints this guards; the generic-error / no-enumeration rule it must preserve.
- **rbac skill** — orthogonal: rbac decides *who may*, rate-limit decides *how often*.
- **api skill** — endpoint shape and status codes (429 joins 401/403/405).
- **database skill** — the `rate_limit_attempts` table, the atomic-upsert pattern, and the cleanup task's bulk deletes.
- **csrf** (`server/middleware/csrf.ts`) — the other edge protection; global middleware, whereas rate limiting is per-handler.