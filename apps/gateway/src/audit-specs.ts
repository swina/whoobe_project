import { createAudit, getApiClient, getGatewayEndpoint, getGatewayRoute, pickAllowed, type ApiClientRecord, type AuditSpec, type GatewayEndpointRecord, type GatewayRouteRecord } from '@whoobe-cms/core/server';
import { logger } from './log-error.js';

// What is audited on the gateway's administration routes (release-0.4-plan.md, "Gateway administration audited"; audit-log-plan.md
// section 4). Add a route here AND put `audited(AUDIT.<name>)` in its middleware list; the route contract test
// (scripts/security/api/route-drift.test.ts) fails for a changing route that has neither this nor a written reason in
// scripts/security/routes.expected.json ("gateway"). A snapshot lists the fields it records: anything not listed is not written.
// An endpoint's credentials (authConfig) and a client's key are never in a row: a credential sent is recorded as "changed".

export const { audited } = createAudit(logger);

type P = { params: Record<string, string>; body?: any };

// ── endpoints ──────────────────────────────────────────────────────────────
const endpointFields = ['name', 'description', 'baseUrl', 'authType', 'requestTimeoutMs', 'rateLimitRps', 'rateLimitBurst', 'requiredPermission', 'isActive'] as const;
// which credentials are stored, by name (`keyValue`, `username`): a change of value is "changed" (authConfigSent), the value never.
// `authFields`, not `credentialFields`: the audit's safety net redacts any key that looks like a credential (SECRET_KEY in audit-log.ts)
const endpointSnapshot = (e: GatewayEndpointRecord) => ({
  ...pickAllowed(e as unknown as Record<string, unknown>, endpointFields),
  authFields: Object.keys(e.authConfig ?? {}).sort(),
});
const endpointLabel = (e?: GatewayEndpointRecord | null) => e?.name;
const loadEndpoint = (req: P) => getGatewayEndpoint(req.params.id);
// the answer leaves authConfig out (redactEndpoint): the state after is read again, or every save would "remove" the credential names
const reloadEndpoint = (_req: P, b: any) => (typeof b?.id === 'string' ? getGatewayEndpoint(b.id) : Promise.resolve(null));
// the names of the credentials the request carries (`authConfig.keyValue`), never a value; a blank field keeps the stored one (admin-routes.ts)
const authConfigSent = (b: any): string[] =>
  b?.authConfig && typeof b.authConfig === 'object'
    ? Object.entries(b.authConfig as Record<string, unknown>).filter(([, v]) => v !== '' && v !== undefined && v !== null).map(([k]) => `authConfig.${k}`)
    : [];

// ── routes ─────────────────────────────────────────────────────────────────
const routeFields = ['endpointId', 'path', 'method', 'description', 'pluginChain', 'autoUpdateSchema', 'cacheTtlSeconds'] as const;
const routeSnapshot = (r: GatewayRouteRecord) => ({ ...pickAllowed(r as unknown as Record<string, unknown>, routeFields), requestBodySchema: !!r.requestBodySchema });
const routeLabel = (r?: GatewayRouteRecord | null) => (r ? `${r.method} ${r.path}` : undefined);
const loadRoute = (req: P) => getGatewayRoute(req.params.id);
// a call made to the operator's upstream with the stored credentials: which route, what came back; never the body sent or received
const upstreamCall = (action: string, statusOf: (b: any) => unknown): AuditSpec<GatewayRouteRecord> => ({
  action, kind: 'event', targetType: 'gateway_route', loadBefore: loadRoute, targetLabel: routeLabel,
  describe: (_r, b, route) => ({ endpointId: route?.endpointId ?? null, upstreamStatus: statusOf(b) ?? null, failed: b?.error === true }),
});

// ── API clients ────────────────────────────────────────────────────────────
// jwtConfig is the registration of the identity provider (issuer, audience, jwksUri, claim rules): addresses and names, no secret
const clientFields = ['name', 'description', 'authMode', 'status', 'scopes', 'rateLimitRps', 'dailyQuota', 'allowedIps', 'expiresAt', 'jwtConfig'] as const;
const clientSnapshot = (c: ApiClientRecord) => pickAllowed(c as unknown as Record<string, unknown>, clientFields);
const clientLabel = (c?: ApiClientRecord | null) => c?.name;
const loadClient = (req: P) => getApiClient(req.params.id);

// annotated on purpose: the inferred type would name express's internals (TS2742)
export const AUDIT: Readonly<Record<string, AuditSpec<any>>> = {
  endpointCreate: { action: 'gateway_endpoint.create', kind: 'create', targetType: 'gateway_endpoint', snapshot: endpointSnapshot, loadAfter: reloadEndpoint, targetLabel: endpointLabel } satisfies AuditSpec<GatewayEndpointRecord>,
  endpointUpdate: { action: 'gateway_endpoint.update', kind: 'update', targetType: 'gateway_endpoint', snapshot: endpointSnapshot, loadBefore: loadEndpoint, loadAfter: reloadEndpoint, targetLabel: endpointLabel,
    secretsFromBody: authConfigSent } satisfies AuditSpec<GatewayEndpointRecord>,
  endpointDelete: { action: 'gateway_endpoint.delete', kind: 'delete', targetType: 'gateway_endpoint', snapshot: endpointSnapshot, loadBefore: loadEndpoint, targetLabel: endpointLabel } satisfies AuditSpec<GatewayEndpointRecord>,
  // the spec's address without its query (a token may ride in it), or only that it was pasted; the answer counts the routes
  endpointImportOpenApi: { action: 'gateway_endpoint.import_openapi', kind: 'event', targetType: 'gateway_endpoint', loadBefore: loadEndpoint, targetLabel: endpointLabel,
    describe: (r, b) => {
      let source = 'pasted';
      if (typeof r.body?.specUrl === 'string') { try { const u = new URL(r.body.specUrl); source = `${u.origin}${u.pathname}`; } catch { source = 'url'; } }
      return { source, created: b?.created ?? null, updated: b?.updated ?? null, skipped: Array.isArray(b?.skipped) ? b.skipped.length : null };
    } } satisfies AuditSpec<GatewayEndpointRecord>,

  // the path's :id is the endpoint: the target is the route that was created
  routeCreate: { action: 'gateway_route.create', kind: 'create', targetType: 'gateway_route', snapshot: routeSnapshot, fromResponse: (b) => b, targetId: (_r, e) => e?.id, targetLabel: routeLabel } satisfies AuditSpec<GatewayRouteRecord>,
  routeUpdate: { action: 'gateway_route.update', kind: 'update', targetType: 'gateway_route', snapshot: routeSnapshot, loadBefore: loadRoute, fromResponse: (b) => b, targetLabel: routeLabel } satisfies AuditSpec<GatewayRouteRecord>,
  routeDelete: { action: 'gateway_route.delete', kind: 'delete', targetType: 'gateway_route', snapshot: routeSnapshot, loadBefore: loadRoute, targetLabel: routeLabel } satisfies AuditSpec<GatewayRouteRecord>,
  // test and refresh call the upstream with the route's own method and store the inferred schema; execute sends the caller's body
  routeTest: upstreamCall('gateway_route.test', (b) => b?.status),
  routeRefreshSchema: upstreamCall('gateway_route.refresh_schema', (b) => b?.status),
  // answered 200 even when it fails: a call that never reached the upstream (route gone, network) changed nothing there
  routeExecute: { ...upstreamCall('gateway_route.execute', (b) => b?.upstreamStatus), skip: (_r, b) => b?.error === true && !b?.upstreamStatus } satisfies AuditSpec<GatewayRouteRecord>,

  // the key is in the answer of a create: never read here, only the client
  clientCreate: { action: 'api_client.create', kind: 'create', targetType: 'api_client', snapshot: clientSnapshot, fromResponse: (b) => b?.client, targetLabel: clientLabel } satisfies AuditSpec<ApiClientRecord>,
  clientUpdate: { action: 'api_client.update', kind: 'update', targetType: 'api_client', snapshot: clientSnapshot, loadBefore: loadClient, fromResponse: (b) => b?.client, targetLabel: clientLabel } satisfies AuditSpec<ApiClientRecord>,
  clientDelete: { action: 'api_client.delete', kind: 'delete', targetType: 'api_client', snapshot: clientSnapshot, loadBefore: loadClient, targetLabel: clientLabel } satisfies AuditSpec<ApiClientRecord>,
  // a key is named by its id and prefix (the lookup part of wbk_<prefix>_...), never the plaintext of the answer
  clientKeyAdd: { action: 'api_client.key_add', kind: 'event', targetType: 'api_client', loadBefore: loadClient, targetLabel: clientLabel,
    describe: (_r, b) => ({ keyId: b?.key?.id ?? null, prefix: b?.key?.prefix ?? null, label: b?.key?.label ?? null, expiresAt: b?.key?.expiresAt ?? null }) } satisfies AuditSpec<ApiClientRecord>,
  clientKeyRevoke: { action: 'api_client.key_revoke', kind: 'event', targetType: 'api_client', loadBefore: loadClient, targetLabel: clientLabel,
    describe: (r) => ({ keyId: r.params.keyId }) } satisfies AuditSpec<ApiClientRecord>,
};
