import type { H3Event } from 'h3'
import { rateLimitService, type RateLimitPolicy } from '../services/rateLimit.service'
import { tooManyRequests } from './errors'

// EDGE UTILITY — lives in server/utils/ alongside auth.ts. Called from route
// handlers to enforce rate limits before any business logic runs.
//
// Usage:
//   await checkRateLimit(event, 'login', { maxAttempts: 5, windowMs: 15 * 60_000 })
//
// Bucket strategy: TWO buckets per sensitive action:
//   1. per-IP          — "login:ip:1.2.3.4"
//      catches distributed credential stuffing from many accounts on one host.
//   2. per-account/key — "login:account:user@example.com"
//      catches targeted brute-force against one account from rotating IPs.
// Both are checked independently; either can trigger a lockout.
// For endpoints with no account key (e.g. /forgot-password), only the IP
// bucket is checked.

export async function checkRateLimit(
  event: H3Event,
  action: string,
  policy: RateLimitPolicy,
  accountKey?: string, // e.g. email — adds a per-account bucket
): Promise<void> {
  // In production, Nitro sets x-forwarded-for behind a trusted proxy.
  // For bare-metal or no proxy, use { xForwardedFor: false } instead.
  const ip = getRequestIP(event, { xForwardedFor: true })

  if (!ip) {
    // Can't identify client IP — skip IP bucket, rely on per-account bucket
    // only. Log so infra can fix the proxy config. DO NOT fall back to a
    // shared 'unknown' bucket: that would collapse all anonymous traffic
    // into one bucket and lock everyone out after a handful of attempts.
    // eslint-disable-next-line no-console
    console.warn('[rateLimit] could not determine client IP for action:', action)
  } else {
    // Check IP bucket first (fastest reject for scanners).
    const ipResult = await rateLimitService.check(`${action}:ip:${ip}`, policy)
    if (!ipResult.allowed) {
      if (ipResult.retryAfter) {
        event.node.res.setHeader('Retry-After', ipResult.retryAfter.toUTCString())
      }
      throw tooManyRequests(ipResult.retryAfter)
    }
  }

  // Per-account bucket — tighter policy, useful for account-targeted attacks.
  if (accountKey) {
    const acctResult = await rateLimitService.check(`${action}:account:${accountKey}`, {
      ...policy,
      // Account lockout is tighter: half the attempts, same window.
      maxAttempts: Math.ceil((policy.maxAttempts ?? 10) / 2),
    })
    if (!acctResult.allowed) {
      if (acctResult.retryAfter) {
        event.node.res.setHeader('Retry-After', acctResult.retryAfter.toUTCString())
      }
      throw tooManyRequests(acctResult.retryAfter)
    }
  }
}
