/** The binding target that fits an element (what a Data Object field is bound to): used by the floating toolbar's picker and the Data panel. */
export function bindingTargetOf(el: any): string {
  if (!el) return 'content'
  if (el.type === 'container' || el.tag === 'slider' || el.tag === 'table') return 'custom'
  if (el.element === 'img') return 'src'
  if (el.tag === 'youtube' || el.tag === 'vimeo') return 'src'
  if (el.tag === 'lucideicon') return 'icon'
  if (el.link) return 'href'
  return 'content'
}
