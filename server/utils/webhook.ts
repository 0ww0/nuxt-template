// server/utils/webhook.ts
// Compensating auth for webhook endpoints that are CSRF-exempt.
//
// Third-party services (Stripe, GitHub, etc.) sign their payloads with a
// shared secret using HMAC-SHA256. Every webhook handler must call
// `requireWebhookSignature(event)` at the top to verify the signature
// before processing the payload. This is the ONLY signature check in the
// request pipeline — the CSRF middleware exemption for /api/webhooks does
// not check any header itself, so there is nothing to keep in sync here.
//
// The default header is `x-webhook-signature`, but callers can override it
// per-provider (e.g. Stripe uses `stripe-signature`, GitHub uses
// `x-hub-signature-256`).

import { createHmac, timingSafeEqual } from 'node:crypto'
import type { H3Event } from 'h3'

/**
 * Verify the HMAC-SHA256 signature on an incoming webhook request.
 *
 * Reads the raw body, computes `HMAC-SHA256(secret, rawBody)` and compares
 * it to the hex-encoded value in the specified header using a
 * timing-safe comparison.
 *
 * @param event       The H3 event (must still have a readable body).
 * @param options.header  Name of the header carrying the hex signature.
 *                        Defaults to `'x-webhook-signature'`.
 * @param options.secret  Override the secret instead of reading from
 *                        `runtimeConfig.webhookSecret`. Useful when a
 *                        single app receives hooks from multiple providers
 *                        with different secrets.
 * @returns The raw body string (so the handler can JSON.parse it once).
 * @throws 401 if the header is missing or the signature is invalid.
 */
export async function requireWebhookSignature(
  event: H3Event,
  options: { header?: string; secret?: string } = {},
): Promise<string> {
  const headerName = options.header ?? 'x-webhook-signature'

  // 1. Resolve the secret
  const secret =
    options.secret ?? (useRuntimeConfig(event) as { webhookSecret?: string }).webhookSecret

  if (!secret) {
    // Hard fail — missing config is a deployment error, not a client error.
    throw createError({
      statusCode: 500,
      statusMessage: 'Webhook secret is not configured',
    })
  }

  // 2. Read the signature header
  const signature = getRequestHeader(event, headerName)
  if (!signature) {
    throw createError({
      statusCode: 401,
      statusMessage: `Missing ${headerName} header`,
    })
  }

  // 3. Read the raw body and compute the expected HMAC
  const rawBody = await readRawBody(event, 'utf8')
  if (!rawBody) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Empty request body',
    })
  }

  const expected = createHmac('sha256', secret).update(rawBody).digest('hex')

  // 4. Timing-safe comparison to prevent length-based timing attacks
  const sigBuf = Buffer.from(signature, 'hex')
  const expBuf = Buffer.from(expected, 'hex')

  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Invalid webhook signature',
    })
  }

  return rawBody
}
