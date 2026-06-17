// Minimal mail seam. The template ships NO mail provider, so by default this
// just logs the message in dev — copy the reset / verification link straight
// from your terminal. For production, wire a real transport (SMTP via
// nodemailer, or an HTTP API like Resend / Postmark / SES) inside the `else`
// branch and keep the `sendMail()` signature so no caller has to change.
//
// Configure provider creds via runtimeConfig (e.g. NUXT_MAIL_API_KEY).
export interface MailMessage {
  to: string
  subject: string
  text: string
  html?: string
}

export async function sendMail(message: MailMessage): Promise<void> {
  if (import.meta.dev) {
    // DEV: no real delivery — surface the contents in the server log.
    console.info(
      `\n[mailer] to: ${message.to}\n[mailer] subject: ${message.subject}\n${message.text}\n`,
    )
    return
  }

  // PRODUCTION: integrate your provider here. Throwing by default makes a
  // missing integration LOUD instead of silently dropping security-critical
  // mail (a dropped reset email looks identical to a working one to the user).
  throw new Error('Mail transport not configured — wire a provider in server/utils/mailer.ts')
}
