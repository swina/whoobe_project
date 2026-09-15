export function resolveGatewayUrl(baseUrl: string, routePath: string, params?: Record<string, string> | undefined): string {
  let resolved = routePath.replace(/^\//, '');
  const base = baseUrl.replace(/\/+$/, '');
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      resolved = resolved.replace(`{${key}}`, encodeURIComponent(value || ''));
    }
  }
  return `${base}/${resolved}`;
}