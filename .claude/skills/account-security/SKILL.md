---
name: account-security
description: Handles account-lifecycle security in this Nuxt 4 + NuxtHub project — password reset (forgot/reset), email verification, and email-OTP multi-factor auth (MFA). All three are built on ONE shared primitive: a hashed one-time secret (store only the SHA-256, email the raw value once, look it up by hash, single-use, expire). The MFA flow uses a fourth token type — a pre-auth httpOnly cookie — to bind the send/verify steps to a server-confirmed password check without exposing userId in request bodies. Use it to add or change a reset/verify/MFA flow, issue and consume a one-time token or OTP, enforce step-up (password reconfirm) before sensitive toggles, prevent account enumeration, revoke sessions after a password change, or wire the email transport. Trigger on casual phrasing too ("forgot password flow", "email a reset link", "verify the user's email", "add 2FA / MFA", "one-time code", "send an OTP", "burn the token after use", "don't leak whether an email exists", "pre-auth cookie", "mfa_preauth"). For login/sessions/password hashing use the auth skill; for the throttling these flows depend on use the rate-limit skill; for tables/migrations use the database skill; for endpoint shape use the api skill.
---

# Account-Security Skill — reset, verify, MFA

The account-lifecycle hardening layer. It extends the auth skill (which owns login/sessions/passwords) with three flows that confirm *control of the email inbox* or *a second factor*: **password reset**, **email verification**, and **email-OTP MFA**. Same layered slice (schema → repository → service → handler), plus the **mailer seam** (`server/utils/mailer.ts`).

## The one thing to get right: the hashed one-time secret

Every flow here issues a secret, emails it once, and later verifies it. The secret is **never stored in raw form** — only its SHA-256 hash.

1. **Generate** with a CSPRNG — `randomBytes(32).toString('base64url')` for links, `randomInt(100_000, 1_000_000)` for the 6-digit OTP.
2. **Store the SHA-256 hash only** (`tokenHash` / `codeHash`, `unique`). Email the raw value exactly once; never persisted.
3. **Use fast SHA-256, not scrypt.** These secrets carry ~256 bits of CSPRNG entropy. Passwords use scrypt; one-time secrets use `sha256()`. Don't cross them.
4. **Verify by hashing the input and looking it up** (`findUsableByHash` = hash matches AND `expiresAt > now()`). No timing oracle.
5. **Single-use + newest-only.** Delete the row(s) on success; delete prior rows when re-issuing.

```
schema   server/db/schema/{passwordResetToken,emailVerificationToken,mfaCode,mfaPreAuthToken}.ts
         + users.{emailVerifiedAt, mfaEnabled}
repo     server/repositories/*.repository.ts
         create / findUsableByHash / deleteByUserId (+ mfaCode.incrementAttempts)
service  server/services/auth.service.ts (reset, verify)
         server/services/mfa.service.ts (OTP)
         server/services/mfaPreAuth.service.ts (pre-auth cookie binding)
handler  server/api/v1/auth/*  →  validate → checkRateLimit → service → status/present
util     server/utils/mailer.ts  →  sendMail({ to, subject, text })
```

---

## §0 Setup (once)

1. **Tables** (one per file, barrel-re-exported), each with `userId` FK `onDelete: 'cascade'`, a `unique` hash column, `expiresAt`, `createdAt`:
   - `password_reset_tokens` (`tokenHash`)
   - `email_verification_tokens` (`tokenHash`)
   - `mfa_codes` (`codeHash`, plus `attempts smallint default 0`)
   - `mfa_preauth_tokens` (`tokenHash`) — 10-min TTL; binds the MFA send/verify flow to a server-confirmed password check
2. **User columns**: `emailVerifiedAt` (nullable timestamp — null = unverified) and `mfaEnabled` (boolean). Run `npm run db:generate`.
3. **Mailer seam** (`server/utils/mailer.ts`) and `runtimeConfig.public.appUrl` for building links (see §5).
4. **Cleanup task** — `server/tasks/auth/cleanup.ts` prunes all four token tables plus sessions and rate-limit attempts hourly (six tables total); nothing extra to add per flow.
5. **Rate-limit actions** — every send/verify endpoint calls `checkRateLimit` (see rate-limit skill).

---

## §1 The shared primitive (per repository)

Each token/code repository exposes the same trio (OTP repo adds one extra):

```ts
create(data)               // INSERT ... RETURNING → return row!
findUsableByHash(hash)     // WHERE hash = ? AND expiresAt > now()  → row | undefined
deleteByUserId(userId)     // burn all outstanding secrets for a user
incrementAttempts(id)      // mfaCode only — atomic sql`attempts + 1`, returns row | undefined
```

Service pattern: `deleteByUserId` (newest-only) → `create(sha256(raw))` → email raw.
Verify pattern: `findUsableByHash(sha256(input))` → act → `deleteByUserId`.

---

## §2 Password reset (`auth.service.ts`)

Two endpoints, 1-hour TTL.

- `POST /api/v1/auth/forgot-password` → `requestPasswordReset(email)`: **silent no-op for unknown or credential-less emails** (anti-enumeration). Always returns the same generic 200. Mail errors are also silently swallowed — a 500 vs 200 difference on a registered email would enumerate accounts. Rate-limited (`forgot-password`, tight + per-email).
- `POST /api/v1/auth/reset-password` → `resetPassword(token, newPassword)`: `findUsableByHash` → update `passwordHash` → burn tokens → **`sessionService.revokeAllForUser`** (all existing sessions die). 401 on bad/expired token; 204 on success.

---

## §3 Email verification (`auth.service.ts`)

24-hour TTL. Issued **best-effort on register** — `register()` wraps `issueEmailVerification` in try/catch and logs on failure; a mail outage never blocks signup.

- `verifyEmail(token)` → `findUsableByHash` → set `emailVerifiedAt = now()` → burn.
- `resendEmailVerification(userId)` → no-op if already verified, else re-issue.
- `POST /api/v1/auth/verify-email` (rate-limited) → 204 on success.

> **Verification is tracked, not yet enforced.** `login()` does NOT check `emailVerifiedAt`. To gate sensitive actions on a confirmed address, use `requireVerifiedUser(event)` from `server/utils/auth.ts`.

---

## §4 MFA — email OTP (`mfa.service.ts` + `mfaPreAuth.service.ts`)

A 6-digit CSPRNG code (`randomInt(100_000, 1_000_000)`), 10-minute TTL, **5-attempt** cap. The session is issued **only after both factors succeed**.

### Login flow when `mfaEnabled` (pre-auth cookie)

The MFA send/verify flow is bound to a server-confirmed password check via a short-lived `httpOnly` pre-auth cookie (`mfa_preauth`, scoped to `/api/v1/auth/mfa`). **Neither `/mfa/send` nor `/mfa/verify` accepts a `userId` in the request body** — the cookie carries the binding. This means an attacker who knows a victim's userId cannot trigger OTP emails for them without also holding the cookie (which requires having passed the password check).

1. `POST /auth/login` → password verified → `authService.login()` returns `{ mfaRequired: true, userId }`. The handler calls `mfaPreAuthService.issueToken(userId)`, sets the `mfa_preauth` cookie (10-min TTL, `httpOnly`, `sameSite: lax`, scoped to `/api/v1/auth/mfa`), and responds **`{ mfa_required: true }`** — no session cookie, **no userId in the response body**.

2. `POST /auth/mfa/send` — **no body**. Handler reads `userId` from the pre-auth cookie via `mfaPreAuthService.validateToken(rawToken)` (does NOT burn — send may be retried). Rate-limited (3/10 min per user + per IP). **Anti-enumeration**: generic `{ message: "If a code is required, it has been sent." }` always, regardless of account existence or MFA status. Mail errors inside `mfaService.sendCode` are silently swallowed for the same reason.

3. `POST /auth/mfa/verify { code }` — **body contains only the OTP code**. Handler calls `mfaPreAuthService.validateToken` on entry (does NOT burn — a wrong OTP should not force a full re-login; the OTP attempt cap + rate limit are the real brute-force gates). Then `checkRateLimit`, then `readValidatedBody`, then `mfaService.verifyCode(userId, code)`:
   - `findUsableByHash` → confirm `record.userId === userId`
   - **atomic `incrementAttempts`** → if `attempts > 5` burn OTP + 401
   - else burn OTP and `sessionService.create`
   
   On success: `mfaPreAuthService.consumeToken(rawToken)` burns the pre-auth token, `mfa_preauth` cookie is cleared, session cookie is set, `presentAuthUserV1(user)` returned. On any failure: 401, pre-auth cookie stays alive for correction and retry.

### `mfaPreAuth.service.ts` — the three methods

```ts
issueToken(userId)       // burns prior token (newest-only) → creates new → returns RAW token
validateToken(rawToken)  // findUsableByHash(sha256(raw)) → returns userId; throws 401 if missing/expired; does NOT burn
consumeToken(rawToken)   // validateToken + deleteByUserId — burn only on success
```

**Why validate-then-burn-on-success:** the OTP 5-attempt cap (atomic `incrementAttempts`) and `mfa-verify` rate limit are the real brute-force gates. Burning the pre-auth token on a wrong OTP would force a full re-login for a simple typo — unnecessary cost with no security gain.

### Enable / disable

`/auth/mfa/enable` and `/auth/mfa/disable` require **step-up auth**: `requireUser` + re-confirm the current password via `authService.login` before toggling. `disable` also burns any outstanding OTP codes.

### Anti-enumeration rules for MFA

- `/mfa/send` always returns a generic 200 regardless of account existence or MFA status.
- Mail errors in `sendCode` are caught and logged; not re-thrown.
- `/mfa/verify` returns a generic 401 on any failure.
- The pre-auth cookie's 401 on missing/expired is also generic.

---

## §5 The mailer seam (`server/utils/mailer.ts`)

`sendMail({ to, subject, text, html? })` is the single delivery seam.

- **Dev:** delivers to **Mailpit** (local SMTP catcher at `http://localhost:8025`, via `docker-compose.dev.yml`). Falls back to `console.log` if Mailpit isn't running.
- **Prod:** the `else` branch **throws by default** ("Mail transport not configured"). Missing mail integration must fail loud.

Wire SMTP (nodemailer) or an HTTP provider (Resend/Postmark/SES) in the prod branch; read credentials from `runtimeConfig`.

---

## §6 Security conventions (non-negotiable)
- **No enumeration.** Forgot-password silent no-op + generic 200; resend no-ops when already verified; `/mfa/send` always generic. Mail errors on the registered-email path silently swallowed.
- **Hash, never store raw.** Only `sha256(secret)` is persisted; the raw value emailed once.
- **Fast hash for one-time secrets, scrypt for passwords.** Don't cross them.
- **Single-use + newest-only.** Burn on success; burn prior secrets on re-issue.
- **Revoke sessions on password change** (`revokeAllForUser`).
- **Step-up for MFA toggles** — re-confirm password before enable/disable.
- **Rate-limit every send and verify** endpoint.
- **Fail loud on missing mail transport** in production.
- **Pre-auth cookie — userId never in body.** `/mfa/send` requires no body; `/mfa/verify` body is `{ code }` only. Any handler that reads `userId` from the request body for MFA is wrong.

---

## §7 TypeScript & gotchas
- `findById` / `findByEmail` return `T | undefined` — guard before use.
- `emailVerifiedAt` is `Date | null` — null means unverified.
- `incrementAttempts` returns `row | undefined` — if the row was deleted between `findUsableByHash` and the increment, treat as a 401.
- Narrow the login result: `if ('mfaRequired' in result)`.
- `mfaPreAuthService.validateToken` does NOT burn; `consumeToken` does. Use `validateToken` on entry to `/mfa/verify` so a wrong OTP doesn't force re-login; use `consumeToken` only after `verifyCode` succeeds.
- `appUrl` must be set in `runtimeConfig.public` or links point nowhere.

---

## §8 Add another email-secret flow (recipe)

New `*_tokens` table (hash `unique`, `userId` FK cascade, `expiresAt`) → repository trio (`create`/`findUsableByHash`/`deleteByUserId`) → service: `deleteByUserId` → `create(sha256(raw))` → `sendMail` → verify: hash input → look up → act → burn → rate-limited handler → add to cleanup task.

## §9 Definition of done
- [ ] Four token tables + `users.emailVerifiedAt` + `users.mfaEnabled`; all in the cleanup task.
- [ ] Only SHA-256 hash stored; raw secret emailed once; `sha256()` (not scrypt) for tokens/OTPs.
- [ ] `findUsableByHash` checks hash AND expiry; single-use burn on success; newest-only on re-issue.
- [ ] Forgot-password silent no-op + generic 200; mail errors silently swallowed.
- [ ] Resend no-ops when already verified.
- [ ] Reset revokes all sessions.
- [ ] `/mfa/send` has no body; userId from pre-auth cookie only; always returns generic 200.
- [ ] `/mfa/verify` body is `{ code }` only; userId from pre-auth cookie; `validateToken` on entry (not `consumeToken`); `consumeToken` called only on success.
- [ ] MFA OTP attempt cap (5) + atomic increment; session issued only after both factors; enable/disable behind step-up.
- [ ] Every send/verify endpoint is rate-limited.
- [ ] Mailer fails loud in prod; dev uses Mailpit with console fallback.
- [ ] `npx nuxt typecheck` passes.

## Relationship to the other docs
- **auth skill** — login/sessions/scrypt; `revokeAllForUser` and generic-failure rule.
- **rbac skill** — `requireVerifiedUser` for gating actions behind email confirmation.
- **rate-limit skill** — every send/verify endpoint depends on `checkRateLimit`.
- **database skill** — token/code tables, FK cascades, cleanup task bulk deletes.
- **api skill** — endpoint shape, status codes (204 on reset/verify; generic 200 on forgot).