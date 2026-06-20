---
name: account-security
description: Handles account-lifecycle security in this Nuxt 4 + NuxtHub project — password reset (forgot/reset), email verification, and email-OTP multi-factor auth (MFA). All three are built on ONE shared primitive: a hashed one-time secret (store only the SHA-256, email the raw value once, look it up by hash, single-use, expire). Use it to add or change a reset/verify/MFA flow, issue and consume a one-time token or OTP, enforce step-up (password reconfirm) before sensitive toggles, prevent account enumeration, revoke sessions after a password change, or wire the email transport. Trigger on casual phrasing too ("forgot password flow", "email a reset link", "verify the user's email", "add 2FA / MFA", "one-time code", "send an OTP", "burn the token after use", "don't leak whether an email exists"). For login/sessions/password hashing use the auth skill; for the throttling these flows depend on use the rate-limit skill; for tables/migrations use the database skill; for endpoint shape use the api skill.
---

# Account-Security Skill — reset, verify, MFA

The account-lifecycle hardening layer. It extends the auth skill (which owns
login/sessions/passwords) with three flows that all confirm *control of the
email inbox* or *a second factor*: **password reset**, **email verification**,
and **email-OTP MFA**. It adds no new architecture — same layered slice
(schema → repository → service → handler) — plus one shared util, the **mailer
seam** (`server/utils/mailer.ts`).

## The one thing to get right: the hashed one-time secret

Every flow here issues a secret, emails it once, and later verifies it. The
secret is **never stored in raw form** — only its hash. This is the same
hardening as session tokens: a DB leak can't be replayed.

1. **Generate** with a CSPRNG — `randomBytes(32).toString('base64url')` for
   links, `randomInt(100_000, 1_000_000)` for the 6-digit OTP.
2. **Store the SHA-256 hash only** (`token_hash` / `code_hash`, `unique`). Email
   the raw value exactly once; it is never persisted.
3. **Use fast SHA-256, not scrypt.** These secrets already carry ~256 bits (or a
   CSPRNG 6-digit space + attempt cap) of entropy, so a slow password KDF buys
   nothing. Passwords use scrypt; one-time secrets use `sha256()`. Don't cross them.
4. **Verify by hashing the input and looking it up** (`findUsableByHash` = hash
   matches AND not expired). The raw value is never compared in app code, so
   there's no found/not-found timing oracle.
5. **Single-use + newest-only**: delete the row(s) for that user after a success,
   and delete prior rows when issuing a new secret. Expiry is enforced by
   `expiresAt`; stale rows are pruned by the cleanup task.

```
schema   server/db/schema/{passwordResetToken,emailVerificationToken,mfaCode}.ts  + users.{emailVerifiedAt,mfaEnabled}
repo     server/repositories/*.repository.ts   create / findUsableByHash / deleteByUserId  (+ mfaCode.incrementAttempts) — ONLY layer with @nuxthub/db
service  server/services/auth.service.ts (reset, verify)   server/services/mfa.service.ts (OTP)   HTTP-agnostic; call the mailer + sessionService
handler  server/api/v1/auth/*   validate → checkRateLimit → service → status/present
util     server/utils/mailer.ts   sendMail({ to, subject, text }) — the delivery seam
```

---

## §0 Setup (once)

1. **Tables** (one per file, barrel-re-exported), each with `userId` FK
   `onDelete: 'cascade'`, a `unique` hash column, `expiresAt`, `createdAt`:
   `password_reset_tokens`, `email_verification_tokens`, `mfa_codes` (the OTP
   table adds `attempts smallint default 0`).
2. **User columns**: `emailVerifiedAt` (nullable timestamp — null = unverified)
   and `mfaEnabled` (boolean). `npm run db:generate`.
3. **Mailer seam** (`server/utils/mailer.ts`) and `runtimeConfig.public.appUrl`
   for building links (see §5).
4. **Cleanup task** — `server/tasks/auth/cleanup.ts` already prunes all three
   tables; nothing extra to add per flow.
5. **Rate-limit actions** — every send/verify endpoint calls `checkRateLimit`
   (see the rate-limit skill); pick an `action` name per endpoint.

---

## §1 The shared primitive (per repository)

Each token/code repository exposes the same trio (the OTP repo adds one):

```ts
create(data)               // INSERT ... RETURNING → return row!
findUsableByHash(hash)     // WHERE hash = ? AND expiresAt > now()  → row | undefined
deleteByUserId(userId)     // burn all outstanding secrets for a user
incrementAttempts(id)      // mfaCode only — atomic `attempts = attempts + 1`, returns row
```

The service always: `deleteByUserId` (newest-only) → `create(sha256(raw))` →
email raw. To verify: `findUsableByHash(sha256(input))` → act → `deleteByUserId`
(single-use). Keep all SQL in the repository — `incrementAttempts` uses raw
`sql\`attempts + 1\`` but stays inside the repo per the layer rule.

---

## §2 Password reset (`auth.service.ts`)

Two endpoints, 1-hour TTL.

- `POST /api/v1/auth/forgot-password` → `requestPasswordReset(email)`:
  **silent no-op if the email isn't registered** (anti-enumeration), else issue a
  token and email `${appUrl}/reset-password?token=…`. The handler always returns
  the **same generic 200** ("if that email is registered…"). Rate-limited
  (`forgot-password`, tight + per-email) to stop email-bomb abuse.
- `POST /api/v1/auth/reset-password` → `resetPassword(token, newPassword)`:
  `findUsableByHash` → update `passwordHash` → burn tokens →
  **`sessionService.revokeAllForUser`** (every existing session dies, so a thief
  who triggered the reset is logged out too). 401 on bad/expired token; 204 on
  success.

---

## §3 Email verification (`auth.service.ts`)

24-hour TTL. Issued **best-effort on register** — `register()` wraps
`issueEmailVerification` in try/catch and logs on failure, so a mail outage never
blocks signup.

- `verifyEmail(token)` → `findUsableByHash` → set `emailVerifiedAt = now()` → burn.
- `resendEmailVerification(userId)` → no-op if already verified, else re-issue.
- `POST /api/v1/auth/verify-email` (rate-limited) → 204 on success. The email link
  points at a client page `/verify-email?token=…` that POSTs here (mirrors reset).

> **Verification is tracked, not yet enforced.** `login()` does **not** check
> `emailVerifiedAt`, so unverified users can currently sign in. To gate sensitive
> actions on a verified email, add a small guard (e.g. `requireVerified(user)`)
> at those handlers — it's an intentional seam, not an oversight.

---

## §4 MFA — email OTP (`mfa.service.ts`)

A 6-digit code, 10-minute TTL, **5-attempt** cap. The session is issued **only
after both factors succeed**.

**Login flow when `mfaEnabled`:**
1. `POST /auth/login` → password verified → `login()` returns
   `{ mfa_required: true, user_id }` and **no session cookie**.
2. `POST /auth/mfa/send { userId }` → `sendCode` issues+emails an OTP
   (rate-limited `mfa-send`, e.g. 3/10 min, 30-min lockout). Login itself does
   **not** send the code — the client requests it here.
3. `POST /auth/mfa/verify { userId, code }` → `verifyCode`:
   `findUsableByHash` → confirm `record.userId === userId` →
   **atomic `incrementAttempts`** → if `attempts > 5` burn + 401 → else burn and
   `sessionService.create`. The handler sets the session cookie and presents the user.

`userId` in the verify body is safe to expose: without the correct OTP the path
ends at 401, and the small code space is protected by the attempt cap **and** the
endpoint rate limit.

**Enable / disable** (`/auth/mfa/enable`, `/auth/mfa/disable`) require **step-up
auth**: `requireUser` + re-confirm the current password via `authService.login`
before toggling, so a hijacked open session can't silently change the MFA posture.
`disable` also burns any outstanding codes.

---

## §5 The mailer seam (`server/utils/mailer.ts`)

`sendMail({ to, subject, text, html? })` is the single delivery seam — keep its
signature stable so no caller changes when you swap providers.

- **Dev:** delivers to **Mailpit** (local SMTP catcher, inbox at
  `http://localhost:8025`, via `docker-compose.dev.yml`). If Mailpit isn't
  running it **falls back to console-logging** the message, so reset/verify/OTP
  links are still recoverable from the terminal.
- **Prod:** the `else` branch **throws by default** ("Mail transport not
  configured"). This is deliberate — a silently dropped reset email looks
  identical to a working one to the user, so a missing integration must fail
  **loud**. Wire SMTP (nodemailer) or an HTTP API (Resend/Postmark/SES) here and
  read creds from `runtimeConfig`.

Email *delivery* (templates, provider, retries, deliverability) is a natural
**next topic / future skill** — this seam is the boundary it would own.

---

## §6 Security conventions (non-negotiable)
- **No enumeration.** Forgot-password is a silent no-op + generic 200; resend is a
  no-op if already verified. Responses never reveal whether an account exists.
- **Hash, never store raw.** Only `sha256(secret)` is persisted; the raw value is
  emailed once. Mirror this for any new email-secret flow.
- **Fast hash for one-time secrets, scrypt for passwords.** Don't use scrypt for
  tokens/OTPs (pointless) or sha256 for passwords (insecure).
- **Single-use + newest-only.** Burn on success; burn prior secrets on re-issue.
- **Revoke sessions on password change** (`revokeAllForUser`).
- **Step-up for MFA toggles** — re-confirm password before enable/disable.
- **Rate-limit every send and verify** endpoint (see rate-limit skill) — these are
  brute-force and email-bomb surfaces.
- **Fail loud on missing mail transport** in production.

---

## §7 TypeScript & gotchas
- `findById` / `findByEmail` return `T | undefined` (`noUncheckedIndexedAccess`) —
  guard before use; services throw `notFound`/`unauthorized` rather than asserting.
- `emailVerifiedAt` is `Date | null`; treat **null as unverified**, not "missing".
- Narrow the login result with the `in` check: `if ('mfaRequired' in result)`.
  Don't index a union member that may not be there.
- `incrementAttempts` returns `| undefined` (row could be deleted between lookup
  and update) — the service treats that race as a 401, not a 500.
- **Step-up reuses `login()` only for its throw-on-bad-password behavior; its
  return value is intentionally ignored.** On `disable`, `mfaEnabled` is still
  `true`, so `login()` returns `{ mfaRequired }` (not the user) — that's fine
  because the handler only relies on the *absence of a throw*. Don't "fix" it to
  consume the return value.
- `appUrl` must be set in `runtimeConfig.public` or links point nowhere.

---

## §8 Add another email-secret flow (recipe)
Mirror the primitive exactly: new `*_tokens` table (hash `unique`, `userId` FK
cascade, `expiresAt`) → repository trio (`create`/`findUsableByHash`/`deleteByUserId`)
→ a service method that `deleteByUserId` → `create(sha256(raw))` → `sendMail` →
a verify method that hashes input, looks up, acts, burns → a rate-limited handler
→ add the table to the cleanup task. (E.g. "email change confirmation",
"passwordless magic-link login" — both are this pattern.)

## §9 Definition of done
- [ ] Three tables (hash `unique`, FK cascade, `expiresAt`) + `users.emailVerifiedAt`
      + `users.mfaEnabled`; all in the cleanup task.
- [ ] Only the SHA-256 hash stored; raw secret emailed once; `sha256` (not scrypt)
      for tokens/OTPs.
- [ ] `findUsableByHash` checks hash **and** expiry; single-use burn on success;
      newest-only burn on re-issue.
- [ ] Forgot-password is a silent no-op + generic 200; resend no-ops when verified.
- [ ] Reset revokes all sessions.
- [ ] MFA: OTP attempt cap + atomic increment; session issued only after both
      factors; enable/disable behind step-up.
- [ ] Every send/verify endpoint is rate-limited.
- [ ] Mailer fails loud in prod; dev uses Mailpit with console fallback.
- [ ] `npx nuxt typecheck` passes.

## Relationship to the other docs
- **auth skill** — login/sessions/scrypt this builds on; `revokeAllForUser` and the
  generic-failure rule it reuses.
- **rate-limit skill** — every send/verify endpoint depends on `checkRateLimit`;
  the MFA attempt cap complements it (small-space brute force).
- **database skill** — the token/code tables, FK cascades, and the cleanup task's
  bulk deletes.
- **api skill** — endpoint shape, validation (`shared/schemas/v1/auth.schema.ts`),
  status codes (204 on reset/verify; generic 200 on forgot).
- **email-delivery** (future topic) — the production transport the mailer seam fronts.
- **tenancy skill** (next topic) — scopes these flows when accounts belong to orgs.
