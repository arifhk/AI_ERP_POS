import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

/**
 * Rule 13: Upstash credentials are read only from server env.
 * This module must be imported from Route Handlers and other server code only.
 */
let client: Redis | null = null;
let limiter: Ratelimit | null = null;

export function getRedis(): Redis {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    throw new Error('Upstash Redis is not configured');
  }
  if (!client) {
    client = new Redis({ url, token });
  }
  return client;
}

function getLimiter(): Ratelimit {
  if (!limiter) {
    limiter = new Ratelimit({
      redis: getRedis(),
      limiter: Ratelimit.slidingWindow(60, '60 s'),
      prefix: 'pos:ratelimit',
      analytics: false,
    });
  }
  return limiter;
}

/** Rule 7: 60 requests per minute. `identifier` must already be a hash, never a raw token. */
export async function enforceRateLimit(identifier: string): Promise<{ success: boolean; remaining: number }> {
  const result = await getLimiter().limit(identifier);
  return { success: result.success, remaining: result.remaining };
}
