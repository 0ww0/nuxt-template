import type { H3Event } from 'h3'
import { sessionService } from '../services/session.service'
import { unauthorized, forbidden } from './errors'
import type { User } from '../db/schema'
import type { UserRole } from '../../shared/auth/roles'

// EDGE / HTTP layer. This is where AUTHORIZATION is enforced (status codes,
// cookies) — kept out of services so they stay HTTP-agnostic. Call these from
// route handlers (or a Nitro middleware).

// One stable cookie name. With HTTPS you can harden to the `__Host-session`
// prefix, but that forces a name change between dev/prod, so we keep it simple.
export const SESSION_COOKIE = 'session'

export function setSessionCookie(event: H3Event, token: string, expiresAt: Date) {
  setCookie(event, SESSION_COOKIE, token, {
    httpOnly: true, // JS can't read it → blocks token theft via XSS
    secure: !import.meta.dev, // HTTPS-only in production
    sameSite: 'lax', // first line of CSRF defense
    path: '/',
    expires: expiresAt,
  })
}

export function clearSessionCookie(event: H3Event) {
  deleteCookie(event, SESSION_COOKIE, { path: '/' })
}

export function getCurrentUser(event: H3Event) {
  return sessionService.resolve(getCookie(event, SESSION_COOKIE))
}

export async function requireUser(event: H3Event): Promise<User> {
  const current = await getCurrentUser(event)
  if (!current) throw unauthorized()
  return current.user
}

// requireRole(event) → just requires a logged-in user.
// requireRole(event, 'admin') → requires that role (or one of several).
export async function requireRole(event: H3Event, ...roles: UserRole[]): Promise<User> {
  const user = await requireUser(event)
  if (roles.length > 0 && !roles.includes(user.role)) throw forbidden()
  return user
}
