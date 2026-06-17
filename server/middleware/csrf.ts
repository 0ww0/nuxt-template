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

// Path prefixes exempt from the check, e.g. third-party webhooks that legitimately
// post from another origin. Add prefixes here as needed.
const SKIP_PREFIXES: string[] = ['/api/webhooks']

export default defineEventHandler((event) => {
  if (!PROTECTED_METHODS.has(event.method)) return
  if (SKIP_PREFIXES.some((prefix) => event.path.startsWith(prefix))) return

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
