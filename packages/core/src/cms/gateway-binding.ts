import type { GatewayBinding } from './block-schema.js';
export type { GatewayBinding };

export function parseGatewayBinding(expression: string): GatewayBinding | null {
  if (!expression.startsWith('gateway:')) return null;
  const withoutPrefix = expression.slice('gateway:'.length);
  const colonIndex = withoutPrefix.indexOf(':');
  if (colonIndex < 0) return null;
  const endpointName = withoutPrefix.slice(0, colonIndex);
  const rest = withoutPrefix.slice(colonIndex + 1);
  const lastColonIndex = rest.lastIndexOf(':');
  if (lastColonIndex < 0) return null;
  const routePath = rest.slice(0, lastColonIndex);
  const fieldPath = rest.slice(lastColonIndex + 1);
  if (!endpointName || !routePath || !fieldPath) return null;
  return { endpointName, routePath, fieldPath };
}

export function isGatewayBinding(expression: string): boolean {
  return expression.startsWith('gateway:');
}

export function buildGatewayBinding(binding: GatewayBinding): string {
  return `gateway:${binding.endpointName}:${binding.routePath}:${binding.fieldPath}`;
}

export function resolveGatewayUrl(baseUrl: string, routePath: string, params?: Record<string, string> | null): string {
  const clean = routePath.replace(/^\//, '');
  const base = baseUrl.replace(/\/+$/, '');
  let url = `${base}/${clean}`;
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url = url.replace(`{${key}}`, encodeURIComponent(value));
    }
  }
  return url;
}

export function extractGatewayParams(routePath: string): string[] {
  const params: string[] = [];
  const regex = /\{(\w+)\}/g;
  let match;
  while ((match = regex.exec(routePath)) !== null) {
    params.push(match[1]);
  }
  return params;
}