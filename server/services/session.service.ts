import { randomBytes } from 'node:crypto'
import { sessionRepository } from '../repositories/session.repository'
import { userRepository } from '../repositories/user.repository'
import type { Session, User } from '../db/schema'

// SERVICE LAYER — business rules. HTTP-agnostic, SHARED across API versions.
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
  async resolve(token: string | undefined): Promise<{ user: User; session: Session } | null> {
    if (!token) return null
    const session = await sessionRepository.findByToken(token)
    if (!session) return null
    if (session.expiresAt.getTime() <= Date.now()) {
      await sessionRepository.deleteByToken(token) // self-healing prune
      return null
    }
    const user = await userRepository.findById(session.userId)
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
