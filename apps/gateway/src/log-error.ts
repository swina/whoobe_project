/** A caught error's `String(err)` (or `err.message`) often embeds the
 *  upstream request URL - which, for an endpoint whose credentials were
 *  pasted into `baseUrl`/route path instead of `authConfig`, includes that
 *  secret - plus internal hostnames and stack detail. None of that belongs
 *  in an HTTP response. Log the real error server-side and let callers
 *  return a generic, safe message instead. */
export function logGatewayError(context: string, err: unknown): void {
  console.error(`[gateway] ${context} failed:`, err);
}
