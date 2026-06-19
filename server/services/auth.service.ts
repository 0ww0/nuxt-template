import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto'
import { userRepository } from '../repositories/user.repository'
import { passwordResetTokenRepository } from '../repositories/passwordResetToken.repository'
import { emailVerificationTokenRepository } from '../repositories/emailVerificationToken.repository'
import { sessionService } from './session.service'
import { sendMail } from '../utils/mailer'
import { conflict, notFound, unauthorized } from '../utils/errors'
import type { User } from '../db/schema'
import type { UserRole } from '../../shared/auth/roles'

// SERVICE LAYER — core auth business rules. HTTP-agnostic.
// Password hashing uses node:crypto scrypt (no extra dependency). Requires a
// Node runtime (this template's Docker image runs `node-server`). On a pure
// edge/serverless runtime, swap to Web Crypto PBKDF2.

function hashPassword(password: string): string {
  const salt = randomBytes(16)
  const derived = scryptSync(password, salt, 64)
  return `${salt.toString('hex')}:${derived.toString('hex')}`
}

function verifyPassword(password: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(':')
  if (!saltHex || !hashHex) return false
  try {
    const derived = scryptSync(password, Buffer.from(saltHex, 'hex'), 64)
    const hash = Buffer.from(hashHex, 'hex')
    return derived.length === hash.length && timingSafeEqual(derived, hash)
  } catch {
    // Corrupted stored hash (invalid hex, zero-length salt, etc.) —
    // treat as a mismatch rather than bubbling up as a 500.
    return false
  }
}

// Fast SHA-256 for one-time tokens (not passwords — these already carry
// 256 bits of CSPRNG entropy so no slow KDF needed).
function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

const RESET_TTL_MS = 60 * 60 * 1000          // reset links valid 1 h
const EMAIL_VERIFY_TTL_MS = 24 * 60 * 60 * 1000 // verify links valid 24 h

async function issueEmailVerification(user: User): Promise<void> {
  await emailVerificationTokenRepository.deleteByUserId(user.id)
  const rawToken = randomBytes(32).toString('base64url')
  await emailVerificationTokenRepository.create({
    userId: user.id,
    tokenHash: sha256(rawToken),
    expiresAt: new Date(Date.now() + EMAIL_VERIFY_TTL_MS),
  })
  const appUrl = useRuntimeConfig().public.appUrl
  const link = `${appUrl}/verify-email?token=${rawToken}`
  await sendMail({
    to: user.email,
    subject: 'Verify your email',
    text: `Confirm your email address (valid for 24 hours):\n${link}`,
  })
}

export const authService = {
  // `role` only ever set by trusted internal callers (seed, admin endpoint),
  // never from a public request body.
  async register(input: {
    email: string
    name: string
    password: string
    role?: UserRole
  }): Promise<User> {
    const existing = await userRepository.findByEmail(input.email)
    if (existing) throw conflict('Email already in use')
    const user = await userRepository.create({
      email: input.email,
      name: input.name,
      role: input.role ?? 'user',
      passwordHash: hashPassword(input.password),
    })
    try {
      await issueEmailVerification(user)
    } catch (err) {
      console.error('[auth] could not send verification email', err)
    }
    return user
  },

  // Returns either the user (MFA disabled → caller creates session) or
  // { mfaRequired: true, userId } (MFA enabled → caller sends OTP, no session yet).
  async login(
    email: string,
    password: string,
  ): Promise<User | { mfaRequired: true; userId: number }> {
    const user = await userRepository.findByEmail(email)
    if (!user || !user.passwordHash || !verifyPassword(password, user.passwordHash)) {
      throw unauthorized('Invalid email or password')
    }
    if (user.mfaEnabled) {
      return { mfaRequired: true as const, userId: user.id }
    }
    return user
  },

  // ---- Password reset (Step 2) -------------------------------------------

  async requestPasswordReset(email: string): Promise<void> {
    const user = await userRepository.findByEmail(email)
    if (!user || !user.passwordHash) return // anti-enumeration: silent no-op

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

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const record = await passwordResetTokenRepository.findUsableByHash(sha256(token))
    if (!record) throw unauthorized('Invalid or expired reset token')

    await userRepository.update(record.userId, { passwordHash: hashPassword(newPassword) })
    await passwordResetTokenRepository.deleteByUserId(record.userId)
    await sessionService.revokeAllForUser(record.userId)
  },

  // ---- Email verification (Step 3) ---------------------------------------

  async resendEmailVerification(userId: number): Promise<void> {
    const user = await userRepository.findById(userId)
    if (!user) throw notFound('User')
    if (user.emailVerifiedAt) return // already verified → no-op
    await issueEmailVerification(user)
  },

  async verifyEmail(token: string): Promise<void> {
    const record = await emailVerificationTokenRepository.findUsableByHash(sha256(token))
    if (!record) throw unauthorized('Invalid or expired verification token')
    await userRepository.update(record.userId, { emailVerifiedAt: new Date() })
    await emailVerificationTokenRepository.deleteByUserId(record.userId)
  },
}
