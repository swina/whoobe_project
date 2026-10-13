// A container whose list depends on a selection ({selection.x} in its route parameters) is filled in the browser, at load and at every change
// of the selection (docs/plans/cms/linked-bindings.md, dynamic bindings). Returns the function that stops it.
import { mountSelection, resolveDynamicChildren } from '@whoobe-cms/renderer'

/**
 * @param {any} descriptor the container's descriptor (with `dynamicList`)
 * @param {any} ctx the Whoobe context (api and adapter options)
 * @param {(children: any[]) => void} onChildren called with the children for the current selection
 */
export function startDynamicList(descriptor, ctx, onChildren) {
  const names = descriptor.dynamicList?.selections
  if (!names || !ctx) return () => {}
  const selection = mountSelection()
  let latest = 0
  const refresh = async () => {
    const mine = ++latest
    const kids = await resolveDynamicChildren(
      descriptor,
      { api: ctx.api, assetBaseUrl: ctx.options?.assetBaseUrl, keyPrefix: ctx.options?.keyPrefix, resolveTargetPage: ctx.options?.resolveTargetPage },
      (n) => selection.get(n),
    )
    if (mine === latest && kids) onChildren(kids)
  }
  const off = selection.subscribe((name) => { if (names.includes(name)) refresh() })
  names.forEach((n) => selection.track(n))
  refresh()
  return () => { latest++; off(); selection.destroy() }
}
