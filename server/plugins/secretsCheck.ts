// server/plugins/secretsCheck.ts
// Startup guards for required secrets and transport configuration.
//
// Checks run in ALL environments — a weak NUXT_SESSION_SECRET in dev means
// forged sessions in dev, which is still a real security risk for the developer.
//
// Hard throws (abort startup):
//   NUXT_SESSION_SECRET < 32 chars — sessions can be forged
//
// Soft warns (log only; app can start, but first affected request will fail):
//   NUXT_WEBHOOK_SECRET missing in production — first webhook call will 500
//   SMTP_HOST missing in production — first email send will 500

export default defineNitroPlugin(() => {
  // ── 1. Session secret — hard gate (all environments) ─────────────────────
  // Sessions are signed with this value. A short or missing secret can be
  // brute-forced offline, allowing an attacker to forge valid session cookies.
  // Generate a safe value: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  const secret = useRuntimeConfig().sessionSecret as string | undefined

  if (!secret || secret.length < 32) {
    throw new Error(
      `[startup] NUXT_SESSION_SECRET must be at least 32 characters (got: ${secret?.length ?? 0}).\n` +
      `  → Have you copied .env.example to .env and filled in the values?\n` +
      `  → Generate a secret: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
    )
  }

  // ── Production-only soft warnings ────────────────────────────────────────
  if (import.meta.dev) return

  // ── 2. Webhook secret — warn ──────────────────────────────────────────────
  // App can start without it, but requireWebhookSignature() will 500 on the
  // first inbound webhook request. Set NUXT_WEBHOOK_SECRET to a random value
  // shared with the provider (Stripe, GitHub, etc.).
  const webhookSecret = useRuntimeConfig().webhookSecret as string | undefined
  if (!webhookSecret) {
    console.warn(
      '[startup] NUXT_WEBHOOK_SECRET is not set — ' +
      'any webhook handler will 500 on first request. ' +
      'Set it to the HMAC secret configured in your provider dashboard.',
    )
  }

  // ── 3. SMTP transport — warn ──────────────────────────────────────────────
  // mailer.ts throws at call time when no transport is configured. Without this
  // check, the misconfiguration is only discovered when a user triggers a
  // password-reset, email-verification, or MFA flow and gets a 500.
  // Add your own provider check here (RESEND_API_KEY, POSTMARK_TOKEN, etc.)
  // if you wire an API-based transport instead of SMTP.
  const smtpHost = process.env.SMTP_HOST
  if (!smtpHost) {
    console.warn(
      '[startup] No SMTP_HOST configured. ' +
      'Password reset, email verification, and MFA will 500 at runtime. ' +
      'Set SMTP_HOST + SMTP_PORT or wire a provider in server/utils/mailer.ts',
    )
  }
})
