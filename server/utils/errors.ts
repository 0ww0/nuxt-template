/**
 * @module server/utils/errors
 * @importedBy services (throws domain errors), route handlers (tooManyRequests via rateLimit.ts)
 * @notFor repositories — they throw raw DB driver errors; services catch and rethrow as domain errors
 *
 * Domain errors thrown by the service layer. Services stay HTTP-agnostic by
 * throwing these; the createError() call still produces a proper H3 error so
 * route handlers don't need to translate anything.
 *
 * ⚠ SECURITY: statusMessage is returned VERBATIM to the client. Always use
 * user-facing resource names (e.g. 'User', 'Post') — never internal names
 * that reveal implementation details (e.g. 'Session', 'PasswordResetToken',
 * 'RateLimitAttempt'). For internal-only 404s, prefer a generic message:
 *   throw notFound('Resource')   ✅
 *   throw notFound('MfaCode')    ❌ — leaks internal table/model name
 */

export function notFound(resource: string) {
  return createError({ statusCode: 404, statusMessage: `${resource} not found` })
}

export function conflict(message: string) {
  return createError({ statusCode: 409, statusMessage: message })
}

export function unauthorized(message = 'Authentication required') {
  return createError({ statusCode: 401, statusMessage: message })
}

export function forbidden(message = 'You do not have permission to do that') {
  return createError({ statusCode: 403, statusMessage: message })
}

// tooManyRequests — thrown by the edge rate-limit util, not services.
// `retryAfter` is a Date so callers can set Retry-After header precisely.
export function tooManyRequests(retryAfter?: Date) {
  const msg = retryAfter
    ? `Too many requests. Try again after ${retryAfter.toUTCString()}.`
    : 'Too many requests. Please slow down.'
  return createError({ statusCode: 429, statusMessage: msg })
}

/**
 * Asserts that a value is non-null/undefined, throwing notFound if not.
 * Use in services after a repository findById call.
 *
 * Eliminates the repeated:
 *   const row = await repo.findById(id)
 *   if (!row) throw notFound('Entity')
 *   return row
 *
 * Replace with:
 *   return assertExists(await repo.findById(id), 'Entity')
 *
 * @example
 *   const user = assertExists(await userRepo.findById(id), 'User')
 *   const project = assertExists(await projectRepo.findById(id), 'Project')
 */
export function assertExists<T>(value: T | null | undefined, label: string): T {
  if (value == null) throw notFound(label)
  return value
}
