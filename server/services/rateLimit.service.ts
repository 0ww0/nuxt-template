// server/services/rateLimit.service.ts
// Business rules for rate-limit policy. HTTP-agnostic — never import `event` or status codes.
// DB access via rateLimitAttempt.repository.ts only.
// Throws: nothing (returns { allowed, retryAfter? }; the edge util owns the 429 throw).
// See also: server/utils/rateLimit.ts (edge util that calls this and throws tooManyRequests).
import { rateLimitAttemptRepository } from '../repositories/rateLimitAttempt.repository'

// POLICY DEFAULTS (tune via the options object per call site):
//   windowMs     — fixed window duration    (default 15 min)
//   maxAttempts  — allowed hits per window  (default 10)
//   lockoutMs    — lockout duration on breach (default 15 min)
//
// ATOMICITY: The repository's `hit()` method collapses the read-decide-write
// into a single SQL upsert with a CASE expression, eliminating the TOCTOU race
// that previously allowed concurrent requests at window-expiry to both reset
// the counter and slip past the threshold.

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

    // ── Fast path: already locked out? ──────────────────────────────
    // Read-only check — avoids the write cost when the bucket is
    // already blocked. This is purely an optimisation; correctness does
    // NOT depend on it — the hit() upsert's blockedUntil CASE checks
    // `blockedUntil > now()` before it checks window expiry, so an
    // active lock survives window rollover even when lockoutMs > windowMs.
    const existing = await rateLimitAttemptRepository.findByBucket(bucket)
    if (existing?.blockedUntil && existing.blockedUntil > new Date()) {
      return { allowed: false, retryAfter: existing.blockedUntil }
    }

    // ── Atomic hit: reset-or-increment in ONE statement ─────────────
    const row = await rateLimitAttemptRepository.hit(bucket, windowMs)

    // ── Threshold breached → lock ───────────────────────────────────
    if (row.count > maxAttempts) {
      const until = new Date(Date.now() + lockoutMs)
      // lockBucket includes a `count > threshold` guard, so a concurrent
      // request that already reset the window won't apply a stale lock.
      await rateLimitAttemptRepository.lockBucket(bucket, until, maxAttempts)
      return { allowed: false, retryAfter: until }
    }

    return { allowed: true }
  },
}
