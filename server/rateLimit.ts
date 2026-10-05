// Sliding-window rate limiting for the entry points a stranger can hammer
// (creating rooms, joining, looking rooms up). In memory and per process,
// like the rest of the server's hot state; `now` is injectable for tests.

export interface RateLimitRule {
    /** Hits allowed inside the window. */
    limit: number
    windowMs: number
}

export class RateLimiter {
    private hits = new Map<string, number[]>()
    private lastPrune = 0

    private rule: RateLimitRule
    private now: () => number

    constructor(rule: RateLimitRule, now: () => number = Date.now) {
        this.rule = rule
        this.now = now
    }

    /** Counts a hit for `key`; false when it is over the limit (the hit is not counted then). */
    allow(key: string): boolean {
        const now = this.now()
        this.prune(now)
        const recent = (this.hits.get(key) ?? []).filter(t => now - t < this.rule.windowMs)
        if (recent.length >= this.rule.limit) {
            this.hits.set(key, recent)
            return false
        }
        recent.push(now)
        this.hits.set(key, recent)
        return true
    }

    /** Forgets a key (a socket that went away). */
    reset(key: string): void {
        this.hits.delete(key)
    }

    get size(): number {
        return this.hits.size
    }

    /** Drops idle keys now and then so the map cannot grow without bound. */
    private prune(now: number): void {
        if (now - this.lastPrune < this.rule.windowMs) return
        this.lastPrune = now
        for (const [key, times] of Array.from(this.hits.entries())) {
            if (times.every(t => now - t >= this.rule.windowMs)) this.hits.delete(key)
        }
    }
}

export interface RequestLike {
    headers: Record<string, string | string[] | undefined>
    remoteAddress?: string
}

/**
 * The client address for rate limiting. Behind a proxy (Render) the real
 * client is in `X-Forwarded-For`; only the entries our own proxies appended
 * can be trusted, so we count `trustedHops` from the right instead of taking
 * the first one, which the client can forge.
 */
export function clientIp(req: RequestLike, trustedHops = 1): string {
    const header = req.headers['x-forwarded-for']
    const raw = Array.isArray(header) ? header.join(',') : header
    if (raw && trustedHops > 0) {
        const parts = raw.split(',').map(p => p.trim()).filter(Boolean)
        if (parts.length > 0) return parts[Math.max(0, parts.length - trustedHops)]
    }
    return req.remoteAddress ?? 'unknown'
}

/** Per-IP limits of the public entry points (defaults; tune with the env in index.ts). */
export const DEFAULT_LIMITS = {
    createRoom: { limit: 10, windowMs: 10 * 60_000 },
    joinRoom: { limit: 30, windowMs: 60_000 },
    roomLookup: { limit: 60, windowMs: 60_000 },
} satisfies Record<string, RateLimitRule>
