// Strips the raw gateway identifiers bind-page-content.ts resolved at
// save time from a page's content before it's ever sent to /public/pages/*
// or /public/page/* (apps/core-api/src/server.ts) - a published site only
// ever sees the opaque bindingId, never the endpointName/routePath/filters
// that would let a visitor's browser call the gateway with an arbitrary
// target. See docs/plans/api-gateway/gateway-auth-authz.md.
//
// `fieldPath`/`params`/`transform` are intentionally KEPT on gatewayBinding:
// `fieldPath` is used locally (packages/sdk/renderer/src/walk.ts) to read a
// field off an already-fetched repeater item without a second gateway call;
// `params` is the {name}-placeholder template the renderer substitutes with
// the visitor's own urlParams before sending resolved values to /resolve;
// `transform` only affects local rendering and is never sent to the gateway.

/** Generic deep-walk (not just `.blocks`) - a page's `content` tree shows up
 *  nested at very different depths across the public response shapes in
 *  server.ts (a page's own `content`, a website-template slot's per-module
 *  `pages[].content`, a directly-authored slot's custom node, the synthetic
 *  404 page's `content`), so this walks every object/array it finds rather
 *  than assuming one fixed shape. */
function walkAndStrip(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) walkAndStrip(item);
    return;
  }
  if (!value || typeof value !== 'object') return;
  const obj = value as Record<string, unknown>;

  const formConfig = obj.formConfig;
  if (formConfig && typeof formConfig === 'object') {
    delete (formConfig as Record<string, unknown>).gatewayEndpointName;
    delete (formConfig as Record<string, unknown>).gatewayRoutePath;
  }

  const gatewayBinding = obj.gatewayBinding;
  if (gatewayBinding && typeof gatewayBinding === 'object') {
    delete (gatewayBinding as Record<string, unknown>).endpointName;
    delete (gatewayBinding as Record<string, unknown>).routePath;
    delete (gatewayBinding as Record<string, unknown>).filters;
  }

  for (const key of Object.keys(obj)) {
    walkAndStrip(obj[key]);
  }
}

/** Deep-clones `value` (a page, a full `{page,params,layout}` response body,
 *  or any structure that may embed page content trees) and strips it for
 *  public consumption - never mutates the caller's copy (that's still the
 *  CMS's own, editor-facing record, which needs the raw fields to keep
 *  working). */
export function sanitizePublicGatewayContent<T>(value: T): T {
  if (value == null) return value;
  const clone = JSON.parse(JSON.stringify(value));
  walkAndStrip(clone);
  return clone;
}
