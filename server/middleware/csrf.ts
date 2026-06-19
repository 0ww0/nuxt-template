// Nitro server middleware — runs on every request. Origin-check CSRF defense:
// for state-changing requests, the browser-sent Origin must match our own host.
// This is defense-in-depth on top of the SameSite=Lax session cookie, and the
// lighter-weight alternative to a token module (nuxt-csurf) for a same-origin
// first-party app like this one.
//
// Requests with NO Origin header (curl, server-to-server, native apps, the dev
// seeder) are not browser cross-site attacks, so they pass through — CSRF only
// exists when a browser auto-attaches the session cookie cross-site.

const PROTECTED_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

// Path prefixes exempt from the origin check because they receive legitimate
// cross-origin calls from third-party services (e.g. Stripe, GitHub).
//
// ⚠ IMPORTANT: Every handler under these prefixes MUST call
// `requireWebhookSignature(event)` from `server/utils/webhook.ts` at the very
// top — that verifies the HMAC-SHA256 signature. The early header check below
// is defense-in-depth, NOT a replacement for per-handler verification.
const SKIP_PREFIXES: string[] = ['/api/webhooks']

// Name of the header that webhook providers send the HMAC signature in.
// Handlers can override this per-provider via requireWebhookSignature options,
// but the middleware-level gate uses this default.
const WEBHOOK_SIGNATURE_HEADER = 'x-webhook-signature'

export default defineEventHandler((event) => {
  if (!PROTECTED_METHODS.has(event.method)) return

  if (SKIP_PREFIXES.some((prefix) => event.path.startsWith(prefix))) {
    // Defense-in-depth: reject webhook requests that don't even carry a
    // signature header. The real HMAC verification happens in the handler
    // via requireWebhookSignature(), but this blocks obviously unsigned
    // requests at the gate (e.g. a browser CSRF or a misconfigured caller).
    const sig = getRequestHeader(event, WEBHOOK_SIGNATURE_HEADER)
    if (!sig) {
      throw createError({
        statusCode: 401,
        statusMessage: `Missing ${WEBHOOK_SIGNATURE_HEADER} header`,
      })
    }
    return
  }

  const origin = getRequestHeader(event, 'origin')
  if (!origin) return // non-browser client — not a CSRF vector

  let originHost: string
  try {
    originHost = new URL(origin).host
  } catch {
    throw createError({ statusCode: 403, statusMessage: 'Invalid Origin header' })
  }

  // Trust x-forwarded-host so the comparison works behind a proxy / on deploy.
  const host = getRequestHost(event, { xForwardedHost: true })
  if (originHost !== host) {
    throw createError({ statusCode: 403, statusMessage: 'Cross-origin request blocked' })
  }
})

