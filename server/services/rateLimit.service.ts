import { rateLimitAttemptRepository } from '../repositories/rateLimitAttempt.repository'

// SERVICE LAYER — rate-limit policy. HTTP-agnostic; the caller (edge util)
// owns the 429 throw. This service only decides whether a bucket is blocked.
//
// POLICY DEFAULTS (tune via the options object per call site):
//   windowMs     — fixed window duration    (default 15 min)
//   maxAttempts  — allowed hits per window  (default 10)
//   lockoutMs    — lockout duration on breach (default 15 min)
//
// Per-endpoint tighter values are set at the call site in checkRateLimit().

export interface RateLimitPolicy {
  windowMs?: number
  maxAttempts?: number
  lockoutMs?: number
}

export interface RateLimitResult {
  allowed: boolean
  retryAfter?: Date // set when blocked
}

export const rateLimitService = {
  async check(bucket: string, policy: RateLimitPolicy = {}): Promise<RateLimitResult> {
    const windowMs = policy.windowMs ?? 15 * 60 * 1000
    const maxAttempts = policy.maxAttempts ?? 10
    const lockoutMs = policy.lockoutMs ?? 15 * 60 * 1000

    const existing = await rateLimitAttemptRepository.findByBucket(bucket)
    const now = new Date()

    // Already locked out?
    if (existing?.blockedUntil && existing.blockedUntil > now) {
      return { allowed: false, retryAfter: existing.blockedUntil }
    }

    // Window expired → reset and count this as hit #1.
    const windowExpired =
      !existing ||
      existing.windowStart.getTime() + windowMs <= now.getTime()

    const row = windowExpired
      ? await rateLimitAttemptRepository.resetBucket(bucket, now)
      : await rateLimitAttemptRepository.increment(bucket, existing.windowStart)

    // Breached → lock.
    if (row.count > maxAttempts) {
      const until = new Date(now.getTime() + lockoutMs)
      await rateLimitAttemptRepository.lockBucket(bucket, until)
      return { allowed: false, retryAfter: until }
    }

    return { allowed: true }
  },
}
