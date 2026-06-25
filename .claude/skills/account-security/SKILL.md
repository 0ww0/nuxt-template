---
name: account-security
description: Handles account-lifecycle security in this Nuxt 4 + NuxtHub project — password reset (forgot/reset), email verification, and email-OTP multi-factor auth (MFA). All three are built on ONE shared primitive: a hashed one-time secret (store only the SHA-256, email the raw value once, look it up by hash, single-use, expire). Use it to add or change a reset/verify/MFA flow, issue and consume a one-time token or OTP, enforce step-up (password reconfirm) before sensitive toggles, prevent account enumeration, revoke sessions after a password change, or wire the email transport. Trigger on casual phrasing too ("forgot password flow", "email a reset link", "verify the user's email", "add 2FA / MFA", "one-time code", "send an OTP", "burn the token after use", "don't leak whether an email exists"). For login/sessions/password hashing use the auth skill; for the throttling these flows depend on use the rate-limit skill; for tables/migrations use the database skill; for endpoint shape use the api skill.
---

# Account-Security Skill — reset, verify, MFA

The account-lifecycle hardening layer. It extends the auth skill (which owns
login/sessions/passwords) with three flows that all confirm *control of the email
inbox* or *a second factor*: **password reset**, **email verification**, and
**email-OTP MFA**. Same layered slice (schema → repository → service → handler),
plus the **mailer seam** (`server/utils/mailer.ts`).

## The one thing to get right: the hashed one-time secret

Every flow here issues a secret, emails it once, and later verifies it. The secret
is **never stored in raw form** — only its SHA-256 hash.

1. **Generate** with a CSPRNG — `randomBytes(32).toString('base64url')` for links, `randomInt(100_000, 1_000_000)` for the 6-digit OTP.
2. **Store the SHA-256 hash only** (`tokenHash` / `codeHash`, `unique`). Email the raw value exactly once; never persisted.
3. **Use fast SHA-256, not scrypt.** These secrets carry ~256 bits of CSPRNG entropy. Passwords use scrypt; one-time secrets use `sha256()`. Don't cross them.
4. **Verify by hashing the input and looking it up** (`findUsableByHash` = hash matches AND `expiresAt > now()`). No timing oracle.
5. **Single-use + newest-only.** Delete the row(s) on success; delete prior rows when re-issuing.

```
schema   server/db/schema/{passwordResetToken,emailVerificationToken,mfaCode}.ts
         + users.{emailVerifiedAt, mfaEnabled}
repo     server/repositories/*.repository.ts
         create / findUsableByHash / deleteByUserId (+ mfaCode.incrementAttempts)
service  server/services/auth.service.ts (reset, verify)
         server/services/mfa.service.ts (OTP)
handler  server/api/v1/auth/*  →  validate → checkRateLimit → service → status/present
util     server/utils/mailer.ts  →  sendMail({ to, subject, text })
```

---

## §0 Setup (once)

1. **Tables** (one per file, barrel-re-exported), each with `userId` FK `onDelete: 'cascade'`, a `unique` hash column, `expiresAt`, `createdAt`:
   - `password_reset_tokens` (`tokenHash`)
   - `email_verification_tokens` (`tokenHash`)
   - `mfa_codes` (`codeHash`, plus `attempts smallint default 0`)
2. **User columns**: `emailVerifiedAt` (nullable timestamp — null = unverified) and `mfaEnabled` (boolean). Run `npm run db:generate`.
3. **Mailer seam** (`server/utils/mailer.ts`) and `runtimeConfig.public.appUrl` for building links (see §5).
4. **Cleanup task** — `server/tasks/auth/cleanup.ts` prunes all three tables hourly; nothing extra to add per flow.
5. **Rate-limit actions** — every send/verify endpoint calls `checkRateLimit` (see rate-limit skill); pick an `action` name per endpoint.

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

- `POST /api/v1/auth/forgot-password` → `requestPasswordReset(email)`:
  **Silent no-op for unknown or credential-less emails** (anti-enumeration). Always returns the same generic 200. Mail errors are also silently swallowed — a 500 vs 200 difference on a registered email would enumerate accounts. Rate-limited (`forgot-password`, tight + per-email).
- `POST /api/v1/auth/reset-password` → `resetPassword(token, newPassword)`:
  `findUsableByHash` → update `passwordHash` → burn tokens → **`sessionService.revokeAllForUser`** (all existing sessions die). 401 on bad/expired token; 204 on success.

---

## §3 Email verification (`auth.service.ts`)

24-hour TTL. Issued **best-effort on register** — `register()` wraps `issueEmailVerification` in try/catch and logs on failure; a mail outage never blocks signup.

- `verifyEmail(token)` → `findUsableByHash` → set `emailVerifiedAt = now()` → burn.
- `resendEmailVerification(userId)` → no-op if already verified, else re-issue.
- `POST /api/v1/auth/verify-email` (rate-limited) → 204 on success. The email link points at a client page `/verify-email?token=…` that POSTs here.

> **Verification is tracked, not yet enforced.** `login()` does NOT check `emailVerifiedAt`. To gate sensitive actions on a confirmed address, use `requireVerifiedUser(event)` from `server/utils/auth.ts` — that's the designated seam, not an oversight.

---

## §4 MFA — email OTP (`mfa.service.ts`)

A 6-digit CSPRNG code (`randomInt(100_000, 1_000_000)`), 10-minute TTL, **5-attempt** cap. The session is issued **only after both factors succeed**.

**Login flow when `mfaEnabled`:**

1. `POST /auth/login` → password verified → `authService.login()` returns `{ mfaRequired: true, userId }` and **no session cookie**. The handler responds `{ mfa_required: true, user_id }`.
2. `POST /auth/mfa/send { userId }` → rate-limited (3/10 min, 30-min lockout). The handler is **anti-enumeration**: if the user doesn't exist or doesn't have MFA enabled, it silently no-ops and returns the **same generic response** (`"If a code is required, it has been sent."`). A mail failure inside `mfaService.sendCode` is also silently swallowed for the same reason — a 500 would leak MFA status.
3. `POST /auth/mfa/verify { userId, code }` → rate-limited (10/10 min, 30-min lockout per user). `findUsableByHash` → confirm `record.userId === userId` → **atomic `incrementAttempts`** → if `attempts > 5` burn + 401 → else burn and `sessionService.create`. Handler sets the cookie and returns `presentAuthUserV1(user)`.

**Enable / disable** (`/auth/mfa/enable`, `/auth/mfa/disable`) require **step-up auth**: `requireUser` + re-confirm the current password via `authService.login` before toggling. `disable` also burns any outstanding codes.

**Anti-enumeration rules for MFA:**
- `/mfa/send` always returns a generic 200 regardless of whether the user exists or has MFA enabled.
- Mail errors in `sendCode` are caught and logged; not re-thrown (same reasoning).
- `/mfa/verify` returns a generic 401 on any failure — never distinguishes "wrong code" from "no such user".

---

## §5 The mailer seam (`server/utils/mailer.ts`)

`sendMail({ to, subject, text, html? })` is the single delivery seam.

- **Dev:** delivers to **Mailpit** (local SMTP catcher at `http://localhost:8025`, via `docker-compose.dev.yml`). Falls back to `console.log` if Mailpit isn't running — links are still recoverable from the terminal.
- **Prod:** the `else` branch **throws by default** ("Mail transport not configured"). Missing mail integration must fail **loud** — a silently dropped email is indistinguishable from a working one to the user.

Wire SMTP (nodemailer) or an HTTP provider (Resend/Postmark/SES) in the prod branch; read credentials from `runtimeConfig`.

---

## §6 Security conventions (non-negotiable)
- **No enumeration.** Forgot-password is a silent no-op + generic 200; resend is a no-op if already verified; `/mfa/send` always returns the same generic message. Mail errors on the registered-email path must also be silently swallowed so response identity is preserved.
- **Hash, never store raw.** Only `sha256(secret)` is persisted; the raw value is emailed once.
- **Fast hash for one-time secrets, scrypt for passwords.** Don't cross them.
- **Single-use + newest-only.** Burn on success; burn prior secrets on re-issue.
- **Revoke sessions on password change** (`revokeAllForUser`).
- **Step-up for MFA toggles** — re-confirm password before enable/disable.
- **Rate-limit every send and verify** endpoint.
- **Fail loud on missing mail transport** in production.

---

## §7 TypeScript & gotchas
- `findById` / `findByEmail` return `T | undefined` — guard before use; throw `notFound`/`unauthorized` in services.
- `emailVerifiedAt` is `Date | null` — null means unverified. Never treat it as "missing".
- `incrementAttempts` returns `row | undefined` — if the row was deleted between `findUsableByHash` and the increment (race condition), treat as a 401.
- Narrow the login result: `if ('mfaRequired' in result)` — don't index a union member that may not be there.
- **Step-up reuses `login()` only for its throw-on-bad-password side effect**; the return value is intentionally ignored on `disable` (where `mfaEnabled` is still true, so `login` returns `{ mfaRequired }` — that's fine).
- `appUrl` must be set in `runtimeConfig.public` or links point nowhere.

---

## §8 Add another email-secret flow (recipe)

Mirror the primitive exactly: new `*_tokens` table (hash `unique`, `userId` FK cascade, `expiresAt`) → repository trio (`create`/`findUsableByHash`/`deleteByUserId`) → service method: `deleteByUserId` → `create(sha256(raw))` → `sendMail` → verify method: hash input → look up → act → burn → rate-limited handler → add to the cleanup task.

Examples fitting this pattern: "email change confirmation", "passwordless magic-link login".

## §9 Definition of done
- [ ] Three tables (hash `unique`, FK cascade, `expiresAt`) + `users.emailVerifiedAt` + `users.mfaEnabled`; all in the cleanup task.
- [ ] Only the SHA-256 hash stored; raw secret emailed once; `sha256()` (not scrypt) for tokens/OTPs.
- [ ] `findUsableByHash` checks hash **and** expiry; single-use burn on success; newest-only burn on re-issue.
- [ ] Forgot-password is a silent no-op + generic 200; mail errors silently swallowed to preserve response identity.
- [ ] Resend no-ops when already verified.
- [ ] Reset revokes all sessions.
- [ ] `/mfa/send` is fully anti-enumeration: generic response for missing users, disabled MFA, and mail errors.
- [ ] MFA: OTP attempt cap (5) + atomic increment; session issued only after both factors; enable/disable behind step-up.
- [ ] Every send/verify endpoint is rate-limited.
- [ ] Mailer fails loud in prod; dev uses Mailpit with console fallback.
- [ ] `npx nuxt typecheck` passes.

## Relationship to the other docs
- **auth skill** — login/sessions/scrypt this builds on; `revokeAllForUser` and generic-failure rule.
- **rbac skill** — `requireVerifiedUser` for gating actions behind email confirmation.
- **rate-limit skill** — every send/verify endpoint depends on `checkRateLimit`; MFA attempt cap complements it.
- **database skill** — token/code tables, FK cascades, and the cleanup task's bulk deletes.
- **api skill** — endpoint shape, validation, status codes (204 on reset/verify; generic 200 on forgot).