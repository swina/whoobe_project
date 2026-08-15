// Website-template composition (docs/plans/cms/website-templates.md) - the
// public page response carries the resolved template's header/aside/footer
// module-page trees alongside the routed body. This helper walks those
// module trees (the same machinery as walkTree) and wraps the body in a
// semantic shell, so adapters render the full page with one descriptor tree.

import { walkTree, type RenderOptions } from './walk.js'
import type { RenderDescriptor } from './descriptor.js'

/** One slot as returned by the public API: the module page trees + the
 *  slot wrapper's own classes/style. */
export interface PublicTemplateSlot {
  className: string
  style: string
  pages: { id: string; title: string; content: unknown }[]
}

/** The `layout` object on `GET /public/pages/:locale/*` responses. */
export interface PublicLayout {
  template: { id: string; name: string }
  header?: PublicTemplateSlot | null
  aside?: PublicTemplateSlot | null
  footer?: PublicTemplateSlot | null
}

/** A composed page shell: each region is a container descriptor (or null
 *  when the slot is empty). `body` is the routed page's descriptor. */
export interface ComposedLayout {
  header: RenderDescriptor | null
  aside: RenderDescriptor | null
  footer: RenderDescriptor | null
  body: RenderDescriptor
}

function slotDescriptor(tag: string, slot: PublicTemplateSlot, options: RenderOptions): Promise<RenderDescriptor> {
  return walkTree(
    {
      id: `whoobe-slot-${tag}`,
      type: 'container',
      tag,
      semantic: tag,
      css: { css: slot.className ?? '', container: '' },
      style: slot.style ?? '',
      blocks: slot.pages.map((p) => p.content as never),
    },
    {},
    options,
  )
}

/** Wraps the routed body descriptor with the template's slot descriptors.
 *  Empty slots yield null regions. */
export async function composeLayout(body: RenderDescriptor, layout: PublicLayout, options: RenderOptions): Promise<ComposedLayout> {
  const [header, aside, footer] = await Promise.all([
    layout.header && layout.header.pages.length > 0 ? slotDescriptor('header', layout.header, options) : null,
    layout.aside && layout.aside.pages.length > 0 ? slotDescriptor('aside', layout.aside, options) : null,
    layout.footer && layout.footer.pages.length > 0 ? slotDescriptor('footer', layout.footer, options) : null,
  ])
  return { header, aside, footer, body }
}
