/**
 * Rate-limit en mémoire (par instance serverless).
 * Suffisant pour casser un burst / brute-force simple.
 * Un attaquant déterminé contourne via cold starts — vague 2 = store partagé.
 */

type Bucket = { n: number; reset: number }

const buckets = new Map<string, Bucket>()

function prune(now: number) {
  if (buckets.size < 4000) return
  for (const [key, bucket] of buckets) {
    if (now >= bucket.reset) buckets.delete(key)
  }
}

/** true = trop de requêtes, il faut refuser. */
export function isRateLimited(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now()
  const cur = buckets.get(key)
  if (!cur || now >= cur.reset) {
    buckets.set(key, { n: 1, reset: now + windowMs })
    prune(now)
    return false
  }
  cur.n += 1
  return cur.n > limit
}
