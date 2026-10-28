import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'

// The correlation id of a request (docs/plans/system/release-0.4-plan.md 3.1): nginx sets X-Request-Id when the
// client sent none, each service keeps a valid one or makes its own, and everything done for the request (log lines,
// audit row, calls to the other services) carries it.

export const REQUEST_ID_HEADER = 'x-request-id'

/** nginx's $request_id is 32 hex characters, a UUID is 36: anything of 8 to 100 safe characters (the audit column keeps 100) is kept as is. */
const VALID_REQUEST_ID = /^[A-Za-z0-9._:-]{8,100}$/

const store = new AsyncLocalStorage<{ requestId: string }>()

export function isValidRequestId(value: unknown): value is string {
  return typeof value === 'string' && VALID_REQUEST_ID.test(value)
}

/** The id of the request being served, or undefined outside one (startup, timers, workers). */
export function currentRequestId(): string | undefined {
  return store.getStore()?.requestId
}

/** Runs `fn` as part of the request `requestId`: for work that leaves the request's own async chain (a queued job). */
export function runWithRequestId<T>(requestId: string, fn: () => T): T {
  return store.run({ requestId }, fn)
}

/** `headers` plus X-Request-Id when there is a current request and the headers do not name one already. */
export function withRequestId<H extends Record<string, string>>(headers: H): H {
  const id = currentRequestId()
  if (!id || Object.keys(headers).some((k) => k.toLowerCase() === REQUEST_ID_HEADER)) return headers
  return { ...headers, 'X-Request-Id': id }
}

/**
 * Express middleware, first in the chain: keeps a valid incoming X-Request-Id or generates one, writes it back on the
 * request (the audit reads it there) and on the response, and runs the rest of the request inside its context.
 */
export function requestIdMiddleware() {
  return (req: IncomingMessage, res: ServerResponse, next: () => void): void => {
    const incoming = req.headers[REQUEST_ID_HEADER]
    const requestId = isValidRequestId(incoming) ? incoming : randomUUID()
    req.headers[REQUEST_ID_HEADER] = requestId
    res.setHeader('X-Request-Id', requestId)
    store.run({ requestId }, next)
  }
}
