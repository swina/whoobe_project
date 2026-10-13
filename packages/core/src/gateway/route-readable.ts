// A data binding READS a route (it is resolved with a GET). A route configured with another method (the webhook of an automation, a write to an
// ERP) is for a form or an automation, never for a binding: calling it with a GET does not read anything and, on a webhook that answers when the
// flow ends, waits until the timeout. Pure function, no I/O.

const norm = (p: string): string => p.replace(/^\/+/, '').replace(/\/+$/, '')

/** Why the route cannot be read by a binding, or null (it is a GET route, or it is not one of the configured routes: a free path stays a GET). */
export function unreadableRouteReason(routes: readonly { path: string; method: string }[], routePath: string | undefined | null): string | null {
  if (!routePath) return null
  const target = norm(routePath)
  const sameTemplate = routes.filter((r) => norm(r.path) === target)
  if (!sameTemplate.length || sameTemplate.some((r) => r.method.toUpperCase() === 'GET')) return null
  const methods = [...new Set(sameTemplate.map((r) => r.method.toUpperCase()))].join('/')
  return `${routePath} is a ${methods} route: a data binding reads GET routes. Use it from the Form settings (a form to a webhook) or as an automation, not as a binding`
}
