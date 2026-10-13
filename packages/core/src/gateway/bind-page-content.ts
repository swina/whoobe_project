// Runs over a page's element tree at save time (apps/core-api/src/server.ts's
// page create/update handlers) and pins every authored Form gateway target /
// container gatewayBinding to a fixed gateway_bindings row - see docs/plans/
// api-gateway/gateway-auth-authz.md. Pure tree-walk + DB calls, no Express
// dependency, so it can run directly inside core-api's request handlers.
//
// Deliberately permissive on failure: a dangling/misconfigured
// endpointName/routePath (e.g. the admin renamed or deleted the endpoint
// after authoring a Form) leaves that one node's gatewayBindingId/bindingId
// unset rather than failing the whole page save - the public gateway routes
// already reject a request with no bindingId, so the failure mode is "this
// one form/container doesn't work," not "the page silently 500s to save."
// Every skip is reported back in `warnings` so the editor can surface it.

import { getGatewayEndpointByName, listGatewayRoutes, findOrCreateGatewayBinding } from '../db/gateway-records.js';

export interface BindPageContentWarning {
  nodeId: string;
  reason: string;
}

export interface BindPageContentResult {
  content: unknown;
  warnings: BindPageContentWarning[];
}

interface FormConfigLike {
  gatewayEndpointName?: string;
  gatewayRoutePath?: string;
  gatewayBindingId?: string;
  [key: string]: unknown;
}

interface GatewayBindingLike {
  endpointName?: string;
  routePath?: string;
  scope?: string | null;
  fieldPath?: string;
  params?: Record<string, string> | null;
  filters?: unknown;
  bindingId?: string;
  [key: string]: unknown;
}

interface NodeLike {
  id?: string;
  formConfig?: FormConfigLike;
  gatewayBinding?: GatewayBindingLike | null;
  blocks?: NodeLike[];
  [key: string]: unknown;
}

/** Marks a submit binding whose `paramKeys` is the form's own field-name allowlist (bindings created before
 *  the allowlist existed have no marker and keep the old forward-everything behaviour). */
export const FORM_FIELDS_SENTINEL = '__fields';

const FORM_FIELD_TAGS = new Set(['input', 'textarea', 'select', 'radiogroup', 'checkbox', 'radio', 'range', 'file']);

/** Names of the inputs inside a Form element's subtree (`data.attributes.name` of input-like elements):
 *  exactly what the browser's FormData will contain, and so the only fields a submission may carry. */
export function collectFormFieldNames(form: unknown): string[] {
  const names = new Set<string>();
  const walkNode = (n: any): void => {
    if (!n || typeof n !== 'object') return;
    const name = n?.data?.attributes?.name;
    if (FORM_FIELD_TAGS.has(String(n.tag ?? '').toLowerCase()) && typeof name === 'string' && name.trim()) names.add(name.trim());
    if (Array.isArray(n.blocks)) n.blocks.forEach(walkNode);
  };
  const root = form as any;
  if (Array.isArray(root?.blocks)) root.blocks.forEach(walkNode);
  return [...names];
}

async function resolveSubmitBinding(
  node: NodeLike,
  websiteId: string,
  warnings: BindPageContentWarning[],
): Promise<void> {
  const formConfig = node.formConfig;
  if (!formConfig?.gatewayEndpointName) return;

  const endpoint = await getGatewayEndpointByName(formConfig.gatewayEndpointName);
  if (!endpoint) {
    warnings.push({ nodeId: node.id ?? '(unknown)', reason: `Gateway endpoint '${formConfig.gatewayEndpointName}' not found` });
    delete formConfig.gatewayBindingId;
    return;
  }
  const routes = await listGatewayRoutes(endpoint.id);
  const route = formConfig.gatewayRoutePath
    ? routes.find((r) => r.path === formConfig.gatewayRoutePath && r.method !== 'GET')
    : routes.find((r) => r.method !== 'GET');
  if (!route) {
    warnings.push({ nodeId: node.id ?? '(unknown)', reason: `No write route configured for endpoint '${formConfig.gatewayEndpointName}'` });
    delete formConfig.gatewayBindingId;
    return;
  }

  try {
    const binding = await findOrCreateGatewayBinding({
      endpointId: endpoint.id,
      routeId: route.id,
      websiteId,
      kind: 'submit',
      // the form's own input names: the submit route forwards nothing else upstream
      paramKeys: [FORM_FIELDS_SENTINEL, ...collectFormFieldNames(node)],
    });
    formConfig.gatewayBindingId = binding.id;
  } catch (err) {
    warnings.push({ nodeId: node.id ?? '(unknown)', reason: err instanceof Error ? err.message : String(err) });
    delete formConfig.gatewayBindingId;
  }
}

async function resolveResolveBinding(
  node: NodeLike,
  websiteId: string,
  warnings: BindPageContentWarning[],
): Promise<void> {
  const binding = node.gatewayBinding;
  // a field or list of the item the element sits in (docs/plans/cms/nested-bindings.md): nothing to pin, nothing is fetched
  if (binding?.scope === 'item') { delete binding.bindingId; return; }
  if (!binding?.endpointName || !binding.routePath) return;

  const endpoint = await getGatewayEndpointByName(binding.endpointName);
  if (!endpoint) {
    warnings.push({ nodeId: node.id ?? '(unknown)', reason: `Gateway endpoint '${binding.endpointName}' not found` });
    delete binding.bindingId;
    return;
  }
  const routes = await listGatewayRoutes(endpoint.id);
  const route = routes.find((r) => r.path === binding.routePath && r.method === 'GET');
  if (!route) {
    warnings.push({ nodeId: node.id ?? '(unknown)', reason: `No GET route '${binding.routePath}' configured for endpoint '${binding.endpointName}'` });
    delete binding.bindingId;
    return;
  }

  try {
    const created = await findOrCreateGatewayBinding({
      endpointId: endpoint.id,
      routeId: route.id,
      websiteId,
      kind: 'resolve',
      fieldPath: binding.fieldPath ?? null,
      paramKeys: Object.keys(binding.params ?? {}),
      filters: binding.filters ?? null,
    });
    binding.bindingId = created.id;
  } catch (err) {
    warnings.push({ nodeId: node.id ?? '(unknown)', reason: err instanceof Error ? err.message : String(err) });
    delete binding.bindingId;
  }
}

async function walk(node: unknown, websiteId: string, warnings: BindPageContentWarning[]): Promise<void> {
  if (!node || typeof node !== 'object') return;
  const n = node as NodeLike;
  await resolveSubmitBinding(n, websiteId, warnings);
  await resolveResolveBinding(n, websiteId, warnings);
  if (Array.isArray(n.blocks)) {
    for (const child of n.blocks) {
      await walk(child, websiteId, warnings);
    }
  }
}

/** Mutates and returns `content` in place (also returned for convenience) -
 *  every authored gateway target gets its bindingId set/refreshed. Safe to
 *  call on content with no gateway usage at all (no-op walk). */
export async function bindPageGatewayContent(content: unknown, websiteId: string): Promise<BindPageContentResult> {
  const warnings: BindPageContentWarning[] = [];
  await walk(content, websiteId, warnings);
  return { content, warnings };
}
