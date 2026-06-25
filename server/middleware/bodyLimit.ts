// server/middleware/bodyLimit.ts
// Defense-in-depth body-size cap for mutating API requests. Rejects a request
// whose declared Content-Length exceeds the limit with 413, before any handler
// reads the body — a cheap guard against memory-pressure payloads on the
// unauthenticated auth endpoints.
//
// ⚠ This checks the Content-Length HEADER, so a chunked request that omits it
// slips past. The HARD guarantee belongs at the proxy: in the Caddyfile add
//   request_body { max_size 1MB }
// which counts actual bytes regardless of framing. This middleware is the
// app-layer backstop, not a replacement for that.
const MAX_BODY_BYTES = 1024 * 1024 // 1 MB
const PROTECTED_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

export default defineEventHandler((event) => {
  if (!PROTECTED_METHODS.has(event.method)) return
  if (!event.path.startsWith('/api/')) return

  const len = Number(getRequestHeader(event, 'content-length'))
  if (Number.isFinite(len) && len > MAX_BODY_BYTES) {
    throw createError({ statusCode: 413, statusMessage: 'Payload too large' })
  }
})
