// Minimal mail seam. In dev this sends through Mailpit (a local SMTP
// catcher — see docker-compose.dev.yml) so you get a real inbox at
// http://localhost:8025 instead of scraping links out of the terminal.
// For production, wire a real transport (SMTP via nodemailer, or an HTTP
// API like Resend / Postmark / SES) inside the `else` branch and keep the
// `sendMail()` signature so no caller has to change.
//
// Configure provider creds via runtimeConfig (e.g. NUXT_MAIL_API_KEY).
import nodemailer from 'nodemailer'

export interface MailMessage {
  to: string
  subject: string
  text: string
  html?: string
}

// Lazily created — avoids opening a transport at module load if mail is
// never sent (e.g. during build/typecheck).
let devTransport: ReturnType<typeof nodemailer.createTransport> | undefined

function getDevTransport() {
  devTransport ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? 'localhost',
    port: Number(process.env.SMTP_PORT ?? 1025),
    secure: false, // Mailpit has no TLS listener
  })
  return devTransport
}

export async function sendMail(message: MailMessage): Promise<void> {
  if (import.meta.dev) {
    // DEV: deliver to Mailpit. Falls back to console logging if Mailpit
    // isn't running (e.g. `npm run dev` without `docker compose up -d`),
    // so the reset/verification link is still recoverable from the terminal.
    try {
      await getDevTransport().sendMail({
        from: 'dev@localhost',
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      })
    } catch (err) {
      console.warn(
        `[mailer] Mailpit unreachable (is "docker compose -f docker-compose.dev.yml up -d" running?) — falling back to console log.\n${(err as Error).message}`,
      )
      console.info(
        `\n[mailer] to: ${message.to}\n[mailer] subject: ${message.subject}\n${message.text}\n`,
      )
    }
    return
  }

  // PRODUCTION: integrate your provider here. Throwing by default makes a
  // missing integration LOUD instead of silently dropping security-critical
  // mail (a dropped reset email looks identical to a working one to the user).
  throw new Error('Mail transport not configured — wire a provider in server/utils/mailer.ts')
}