import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { userRepository } from '../repositories/user.repository'
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
}
