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

// Resolve the host we consider "ours" for the Origin comparison.
//
// We pin this to the configured public app URL rather than trusting
// `x-forwarded-host`. A client-supplied forwarded header is attacker-controlled
// unless the proxy overwrites it, so comparing Origin against it would let an
// attacker send Origin: evil + X-Forwarded-Host: evil and pass the check —
// a full CSRF bypass. Pinning to runtimeConfig.public.appUrl removes that trust.
//
// (Operator note: appUrl MUST equal the public origin the app is served on —
// the same value email links use. If it's unset/unparseable we fall back to the
// proxy-supplied host and warn, preserving old behaviour but logging the gap.)
function expectedHost(event: Parameters<typeof getRequestHost>[0]): string {
  const appUrl = (useRuntimeConfig(event).public as { appUrl?: string }).appUrl
  if (appUrl) {
    try {
      return new URL(appUrl).host
    } catch {
      console.warn('[csrf] public.appUrl is not a valid URL; falling back to forwarded host')
    }
  } else {
    console.warn('[csrf] public.appUrl is not set; falling back to forwarded host')
  }
  return getRequestHost(event, { xForwardedHost: true })
}

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

  // Compare against our PINNED host, not a client-supplied forwarded header.
  if (originHost !== expectedHost(event)) {
    throw createError({ statusCode: 403, statusMessage: 'Cross-origin request blocked' })
  }
})
