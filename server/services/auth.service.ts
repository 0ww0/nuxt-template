import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto'
import { userRepository } from '../repositories/user.repository'
import { passwordResetTokenRepository } from '../repositories/passwordResetToken.repository'
import { sessionService } from './session.service'
import { sendMail } from '../utils/mailer'
import { conflict, unauthorized } from '../utils/errors'
import type { User } from '../db/schema'
import type { UserRole } from '../../shared/auth/roles'

// SERVICE LAYER — business rules. HTTP-agnostic, SHARED across API versions.
// Password hashing uses node:crypto scrypt (no extra dependency). This requires
// a Node runtime (this template's Docker image runs `node-server`). On a pure
// edge/serverless runtime, swap to a Web Crypto PBKDF2 implementation.
function hashPassword(password: string): string {
  const salt = randomBytes(16)
  const derived = scryptSync(password, salt, 64)
  return `${salt.toString('hex')}:${derived.toString('hex')}`
}

function verifyPassword(password: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(':')
  if (!saltHex || !hashHex) return false
  const derived = scryptSync(password, Buffer.from(saltHex, 'hex'), 64)
  const hash = Buffer.from(hashHex, 'hex')
  return derived.length === hash.length && timingSafeEqual(derived, hash)
}

// Fast hash for the reset token (NOT a password). The token already carries 256
// bits of CSPRNG entropy, so it needs no slow KDF — we only hash it so the DB
// stores a non-replayable digest instead of the live secret.
function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

const RESET_TTL_MS = 1000 * 60 * 60 // reset links are valid for 1 hour

export const authService = {
  // `role` is only ever set by trusted internal callers (seed, admin endpoint),
  // never from a public request body.
  async register(input: {
    email: string
    name: string
    password: string
    role?: UserRole
  }): Promise<User> {
    const existing = await userRepository.findByEmail(input.email)
    if (existing) throw conflict('Email already in use')
    return userRepository.create({
      email: input.email,
      name: input.name,
      role: input.role ?? 'user',
      passwordHash: hashPassword(input.password),
    })
  },

  async login(email: string, password: string): Promise<User> {
    const user = await userRepository.findByEmail(email)
    // Same generic error whether the email is unknown or the password is wrong,
    // so the endpoint doesn't leak which emails exist.
    if (!user || !user.passwordHash || !verifyPassword(password, user.passwordHash)) {
      throw unauthorized('Invalid email or password')
    }
    return user
  },

  // Step 1 of reset. The HANDLER always returns the same generic response (see
  // forgot-password.post.ts) so this can't be used to enumerate accounts; here
  // we simply no-op for unknown or passwordless users.
  async requestPasswordReset(email: string): Promise<void> {
    const user = await userRepository.findByEmail(email)
    if (!user || !user.passwordHash) return

    // Keep only the newest link live — issuing a new token kills older ones.
    await passwordResetTokenRepository.deleteByUserId(user.id)

    const rawToken = randomBytes(32).toString('base64url')
    await passwordResetTokenRepository.create({
      userId: user.id,
      tokenHash: sha256(rawToken),
      expiresAt: new Date(Date.now() + RESET_TTL_MS),
    })

    const appUrl = useRuntimeConfig().public.appUrl
    const link = `${appUrl}/reset-password?token=${rawToken}`
    await sendMail({
      to: user.email,
      subject: 'Reset your password',
      text: `Use this link to reset your password (valid for 1 hour):\n${link}\n\nIf you didn't request this, you can ignore this email.`,
    })
  },

  // Step 2 of reset. Consumes the token, rotates the password hash, burns every
  // outstanding token for the user, and revokes ALL their sessions so any stolen
  // session dies the moment the password changes.
  async resetPassword(token: string, newPassword: string): Promise<void> {
    const record = await passwordResetTokenRepository.findUsableByHash(sha256(token))
    if (!record) throw unauthorized('Invalid or expired reset token')

    await userRepository.update(record.userId, { passwordHash: hashPassword(newPassword) })
    await passwordResetTokenRepository.deleteByUserId(record.userId) // single-use
    await sessionService.revokeAllForUser(record.userId)
  },
}
