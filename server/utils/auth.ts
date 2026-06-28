/**
 * @module server/utils/auth
 * @importedBy route handlers (server/api/**), server/plugins/secretsCheck.ts
 * @notFor services — they receive the resolved user as a plain argument, never `event`
 *
 * Edge utilities for session cookie I/O and role gating. Everything here is
 * HTTP-aware and intentionally lives outside the service layer.
 */
import type { H3Event } from 'h3'
import { sessionService } from '../services/session.service'
import { unauthorized, forbidden } from './errors'
import type { User } from '../db/schema'
import { roleAtLeast, type UserRole } from '../../shared/auth/roles'

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
// requireRole(event, 'admin') → requires EXACTLY that role (or one of several).
// Use this for orthogonal roles. For a privilege ladder, prefer requireMinRole.
export async function requireRole(event: H3Event, ...roles: UserRole[]): Promise<User> {
  const user = await requireUser(event)
  if (roles.length > 0 && !roles.includes(user.role)) throw forbidden()
  return user
}

// requireMinRole(event, 'super_admin') → that role OR higher on the ladder.
// This is the one to use for sensitive actions; a super_admin passes an
// `admin` check automatically.
export async function requireMinRole(event: H3Event, min: UserRole): Promise<User> {
  const user = await requireUser(event)
  if (!roleAtLeast(user.role, min)) throw forbidden()
  return user
}

// Authorization guard for ROLE ASSIGNMENT (creating or changing a user's role).
// An actor may never grant a role ABOVE their own rank — so an admin cannot mint
// or promote anyone to super_admin. `requireMinRole` caps WHO may assign a role;
// this caps WHICH role they may assign. Use both. Throws 403.
export function assertCanAssignRole(actor: User, role: UserRole): void {
  if (!roleAtLeast(actor.role, role)) {
    throw forbidden('Cannot assign a role above your own')
  }
}

// requireVerifiedUser(event) → logged in AND email-verified. Use to gate
// actions that must not run for an unconfirmed address (403 if unverified).
// Authentication (401) is still checked first by requireUser.
export async function requireVerifiedUser(event: H3Event): Promise<User> {
  const user = await requireUser(event)
  if (!user.emailVerifiedAt) throw forbidden('Email not verified')
  return user
}
