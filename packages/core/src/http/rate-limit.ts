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
