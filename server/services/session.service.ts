// server/services/session.service.ts
// Business rules for Session lifecycle. HTTP-agnostic — never import `event` or status codes.
// DB access via session.repository.ts only.
// Throws: nothing (callers treat null as "no session"; edge throws 401 if required).
// See also: auth.service.ts (credential verification that precedes session creation).
import { randomBytes } from 'node:crypto'
import { sessionRepository } from '../repositories/session.repository'
import type { Session, User } from '../db/schema'

// Session TTL is a business policy and lives here, not in a route handler.
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30 // 30 days

export const sessionService = {
  async create(userId: number): Promise<Session> {
    const token = randomBytes(32).toString('base64url')
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS)
    return sessionRepository.create({ token, userId, expiresAt })
  },

  // Resolve the current user from a token. Returns null (not an error) for the
  // common "no/expired session" case so callers can treat anonymous as valid;
  // the EDGE decides whether that's a 401 (see server/utils/auth.ts).
  //
  // One DB round-trip via the session⨝user join. The two self-healing prunes
  // (expired session, orphaned session) are preserved exactly as before.
  async resolve(token: string | undefined): Promise<{ user: User; session: Session } | null> {
    if (!token) return null

    const found = await sessionRepository.findByTokenWithUser(token)
    if (!found) return null

    const { session, user } = found

    if (session.expiresAt.getTime() <= Date.now()) {
      await sessionRepository.deleteByToken(token) // self-healing prune
      return null
    }
    if (!user) {
      await sessionRepository.deleteByToken(token) // self-heal orphan session
      return null
    }

    return { user, session }
  },

  revoke(token: string): Promise<boolean> {
    return sessionRepository.deleteByToken(token)
  },

  revokeAllForUser(userId: number): Promise<void> {
    return sessionRepository.deleteByUserId(userId)
  },
}
