// Small in-memory fixed-window limiter for unauthenticated endpoints (single process, like the existing
// login/form guards). Bounded: expired windows are pruned and the table cannot grow past `maxKeys`.
export interface FixedWindowLimiter {
  /** Counts one hit for `key`; returns true when the hit is over the limit. */
  hit(key: string, now?: number): boolean;
  size(): number;
}

export function createFixedWindowLimiter(opts: { max: number; windowMs: number; maxKeys?: number }): FixedWindowLimiter {
  const { max, windowMs, maxKeys = 10_000 } = opts;
  const windows = new Map<string, { count: number; start: number }>();

  function prune(now: number): void {
    for (const [k, w] of windows) if (now - w.start > windowMs) windows.delete(k);
    // still full of live windows (many distinct keys): drop the oldest instead of growing without bound
    while (windows.size >= maxKeys) {
      const oldest = windows.keys().next().value;
      if (oldest === undefined) break;
      windows.delete(oldest);
    }
  }

  return {
    hit(key, now = Date.now()) {
      const w = windows.get(key);
      if (!w || now - w.start > windowMs) {
        if (!w && windows.size >= maxKeys) prune(now);
        windows.set(key, { count: 1, start: now });
        return false;
      }
      w.count += 1;
      return w.count > max;
    },
    size: () => windows.size,
  };
}

/** Failure counter with a lock-out: `max` failures lock the key for `lockMs`; success clears it. Used where a
 *  secret is guessed (MFA codes, re-authentication passwords) and the lock must follow the account, not a
 *  single token or connection. Bounded like the window limiter. */
export interface FailureLock {
  isLocked(key: string, now?: number): boolean;
  fail(key: string, now?: number): void;
  clear(key: string): void;
  size(): number;
}

export function createFailureLock(opts: { max: number; lockMs: number; maxKeys?: number }): FailureLock {
  const { max, lockMs, maxKeys = 10_000 } = opts;
  const entries = new Map<string, { count: number; lockedUntil: number }>();
  return {
    isLocked(key, now = Date.now()) {
      const e = entries.get(key);
      return !!e && e.lockedUntil > now;
    },
    fail(key, now = Date.now()) {
      if (!entries.has(key) && entries.size >= maxKeys) {
        for (const [k, v] of entries) if (v.lockedUntil <= now) entries.delete(k);
        while (entries.size >= maxKeys) {
          const oldest = entries.keys().next().value;
          if (oldest === undefined) break;
          entries.delete(oldest);
        }
      }
      const e = entries.get(key) ?? { count: 0, lockedUntil: 0 };
      if (e.lockedUntil <= now) e.lockedUntil = 0;
      e.count += 1;
      if (e.count >= max) {
        e.lockedUntil = now + lockMs;
        e.count = 0;
      }
      entries.set(key, e);
    },
    clear(key) {
      entries.delete(key);
    },
    size: () => entries.size,
  };
}
