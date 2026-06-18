// Domain errors thrown by the service layer. Services stay HTTP-agnostic by
// throwing these; the createError() call still produces a proper H3 error so
// route handlers don't need to translate anything. If you ever move a service
// out of Nitro, swap these for plain Error subclasses.

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
