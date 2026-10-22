import { createHash, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, RequestHandler, Response } from 'express';

// Prometheus text format by hand: a counter and a histogram for requests, plus gauges the caller collects at scrape time.
// No dependency, no per-user or per-id label: the route is the matched pattern (`/auth/users/:id`), never the URL.

const BUCKETS = [0.005, 0.025, 0.1, 0.25, 0.5, 1, 2.5, 10];
const MAX_ROUTES = 500;   // a bound on series, whatever the routes do

const esc = (v: string): string => v.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/"/g, '\\"');
const labels = (l: Record<string, string>): string => {
  const parts = Object.entries(l).map(([k, v]) => `${k}="${esc(v)}"`);
  return parts.length ? `{${parts.join(',')}}` : '';
};

export interface Gauge { name: string; help: string; samples: { labels?: Record<string, string>; value: number }[] }

export interface HttpMetrics {
  middleware: RequestHandler;
  observe(method: string, route: string, status: number, seconds: number): void;
  render(gauges: Gauge[]): string;
}

export function createHttpMetrics(workspace: string | undefined = process.env.WHOOBE_WORKSPACE): HttpMetrics {
  // One Prometheus can scrape many workspaces: when WHOOBE_WORKSPACE is set, every series carries it.
  const L = (l: Record<string, string>): string => labels(workspace ? { workspace, ...l } : l);
  const requests = new Map<string, number>();                       // method|route|class -> count
  const durations = new Map<string, { buckets: number[]; sum: number; count: number }>();   // route -> histogram
  const routes = new Set<string>();

  const routeLabel = (route: string): string => {
    if (routes.has(route)) return route;
    if (routes.size >= MAX_ROUTES) return 'other';
    routes.add(route);
    return route;
  };

  function observe(method: string, route: string, status: number, seconds: number): void {
    const r = routeLabel(route);
    const key = `${method}|${r}|${Math.floor(status / 100)}xx`;
    requests.set(key, (requests.get(key) ?? 0) + 1);
    const h = durations.get(r) ?? { buckets: BUCKETS.map(() => 0), sum: 0, count: 0 };
    BUCKETS.forEach((b, i) => { if (seconds <= b) h.buckets[i] += 1; });
    h.sum += seconds;
    h.count += 1;
    durations.set(r, h);
  }

  /** Express middleware: records on `finish`. The route is the matched pattern, or `unmatched` (a 404 must not mint a series per URL). */
  const middleware: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
    if (req.path === '/metrics') { next(); return; }
    const start = process.hrtime.bigint();
    res.on('finish', () => {
      const route = req.route?.path !== undefined ? `${req.baseUrl}${typeof req.route.path === 'string' ? req.route.path : String(req.route.path)}` : 'unmatched';
      observe(req.method, route, res.statusCode, Number(process.hrtime.bigint() - start) / 1e9);
    });
    next();
  };

  function render(gauges: Gauge[]): string {
    const out: string[] = [];
    out.push('# HELP whoobe_http_requests_total HTTP requests answered, by method, matched route and status class.', '# TYPE whoobe_http_requests_total counter');
    for (const [key, n] of [...requests].sort()) {
      const [method, route, statusClass] = key.split('|');
      out.push(`whoobe_http_requests_total${L({ method, route, status: statusClass })} ${n}`);
    }
    out.push('# HELP whoobe_http_request_duration_seconds Time to answer, by matched route.', '# TYPE whoobe_http_request_duration_seconds histogram');
    for (const [route, h] of [...durations].sort()) {
      BUCKETS.forEach((b, i) => out.push(`whoobe_http_request_duration_seconds_bucket${L({ route, le: String(b) })} ${h.buckets[i]}`));
      out.push(`whoobe_http_request_duration_seconds_bucket${L({ route, le: '+Inf' })} ${h.count}`);
      out.push(`whoobe_http_request_duration_seconds_sum${L({ route })} ${h.sum}`);
      out.push(`whoobe_http_request_duration_seconds_count${L({ route })} ${h.count}`);
    }
    for (const g of gauges) {
      out.push(`# HELP ${g.name} ${g.help}`, `# TYPE ${g.name} gauge`);
      for (const s of g.samples) out.push(`${g.name}${L(s.labels ?? {})} ${s.value}`);
    }
    return out.join('\n') + '\n';
  }

  return { middleware, observe, render };
}

/** `Authorization: Bearer <token>` against the configured token, in constant time. No token configured = nobody passes. */
export function metricsTokenOk(header: string | undefined, token: string | undefined): boolean {
  if (!token) return false;
  const m = /^Bearer (.+)$/.exec(header ?? '');
  if (!m) return false;
  const a = createHash('sha256').update(m[1]).digest();
  const b = createHash('sha256').update(token).digest();
  return timingSafeEqual(a, b);
}

/** A short-lived memo of an async check, so a public probe cannot turn into one database query per request. */
export function memoAsync<T>(fn: () => Promise<T>, ttlMs: number): () => Promise<T> {
  let at = 0;
  let pending: Promise<T> | null = null;
  let value: T;
  return async () => {
    const now = Date.now();
    if (pending) return pending;
    if (at && now - at < ttlMs) return value;
    pending = fn().then((v) => { value = v; at = Date.now(); return v; }).finally(() => { pending = null; });
    return pending;
  };
}
