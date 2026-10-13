// A list that depends on a selection (docs/plans/cms/linked-bindings.md, "dynamic bindings"): `params: { id: '{selection.category}' }` on an
// Integrations route like `catalogue/category/{id}`. The server cannot know the visitor's choice, so the page is rendered with the container empty
// and the adapter calls this in the browser at load (a choice kept in the URL) and every time the selection changes. It walks the container's
// children for each item exactly like the server does, so formatting, images and links are the same.

import { substituteSelectionParams } from '@whoobe-cms/schema'
import type { RenderDescriptor } from './descriptor.js'
import { resolveGatewayBinding } from './resolve.js'
import { walkGatewayValue, type RenderOptions } from './walk.js'

/** The children of a dynamic container for the current selection: [] while a selection it needs is empty; null when the descriptor is not a
 *  dynamic list or the gateway failed (the caller keeps what it shows). */
export async function resolveDynamicChildren(
  descriptor: RenderDescriptor,
  options: RenderOptions,
  getSelection: (name: string) => string | null,
): Promise<RenderDescriptor[] | null> {
  const node = descriptor.node
  const binding = node.gatewayBinding
  if (!descriptor.dynamicList || !binding) return null
  const params = substituteSelectionParams(binding.params, getSelection)
  if (params === null) return []
  const api = options.api
  const gatewayUrl = api.gatewayUrl || 'http://localhost:3001'
  let resolved: unknown
  try {
    resolved = await resolveGatewayBinding({ ...binding, params }, gatewayUrl, descriptor.dynamicList.urlParams, api.gatewaySiteAuth, api.gatewayResolveProxyPath)
  } catch (err) {
    console.warn(`[whoobe] container ${node.id ?? ''}: the list for this selection could not be loaded:`, err instanceof Error ? err.message : err)
    return null
  }
  return (await walkGatewayValue(node, resolved, { urlParams: descriptor.dynamicList.urlParams }, options)) ?? []
}
