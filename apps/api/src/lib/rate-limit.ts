// In-memory fixed-window rate limiter for brute-force protection on auth endpoints.
// The API runs as a single PM2 fork instance, so a per-process map is sufficient;
// state resets on restart — which an attacker can't trigger.
type Bucket = { count: number; resetAt: number }

const buckets = new Map<string, Bucket>()

/**
 * Returns { ok:false } once `key` exceeds `max` hits within `windowMs`.
 * retryAfter is the seconds until the window resets.
 */
export function rateLimit(
  key: string,
  max: number,
  windowMs: number,
): { ok: boolean; retryAfter: number } {
  const now = Date.now()
  const bucket = buckets.get(key)
  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { ok: true, retryAfter: 0 }
  }
  bucket.count += 1
  if (bucket.count > max) {
    return { ok: false, retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) }
  }
  return { ok: true, retryAfter: 0 }
}

// Bound memory: drop expired buckets each minute. unref() so it never keeps the
// process (or the test runner) alive.
const sweeper = setInterval(() => {
  const now = Date.now()
  for (const [key, bucket] of buckets) {
    if (now >= bucket.resetAt) buckets.delete(key)
  }
}, 60_000)
sweeper.unref?.()
