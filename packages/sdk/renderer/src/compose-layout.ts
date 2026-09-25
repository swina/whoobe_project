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
  /** Alpine.js directives applied to the wrapper element. */
  alpine?: Record<string, string>
  pages: { id: string; title: string; content: unknown }[]
}

/** The `layout` object on `GET /public/pages/:locale/*` responses. */
export interface PublicLayout {
  template: { id: string; name: string }
  header?: PublicTemplateSlot | null
  aside?: PublicTemplateSlot | null
  /** Main body wrapper — className/style applied to the <main> element. */
  main?: PublicTemplateSlot | null
  footer?: PublicTemplateSlot | null
  /** Body wrapper — className/style/alpine on the outermost container. */
  body?: PublicTemplateSlot | null
  /** 404 error page — rendered with module pages when the routed page is
   *  not found. */
  notFound404?: PublicTemplateSlot | null
}

/** A composed page shell: each region is a container descriptor (or null
 *  when the slot is empty). `body` is the routed page's descriptor. */
export interface ComposedLayout {
  header: RenderDescriptor | null
  aside: RenderDescriptor | null
  main: RenderDescriptor | null
  footer: RenderDescriptor | null
  /** Root page wrapper descriptor (class/style/alpine on the outermost
   *  container). Null when no body slot is configured. */
  bodyWrap: RenderDescriptor | null
  notFound404: RenderDescriptor | null
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
      alpine: slot.alpine ?? undefined,
      blocks: slot.pages.map((p) => p.content as never),
    },
    {},
    options,
  )
}

/** Wraps the routed body descriptor with the template's slot descriptors.
 *  Empty slots yield null regions. */
export async function composeLayout(body: RenderDescriptor, layout: PublicLayout, options: RenderOptions): Promise<ComposedLayout> {
  const [header, aside, main, footer, notFound404, bodyWrap] = await Promise.all([
    layout.header && layout.header.pages.length > 0 ? slotDescriptor('header', layout.header, options) : null,
    layout.aside && layout.aside.pages.length > 0 ? slotDescriptor('aside', layout.aside, options) : null,
    layout.main && layout.main.pages.length > 0 ? slotDescriptor('main', layout.main, options) : null,
    layout.footer && layout.footer.pages.length > 0 ? slotDescriptor('footer', layout.footer, options) : null,
    layout.notFound404 && layout.notFound404.pages.length > 0 ? slotDescriptor('notFound404', layout.notFound404, options) : null,
    // Unlike the other slots, `body` never has content pages of its own
    // (WebsiteTemplatesManager.vue hides that field for it) - it's a pure
    // className/style/alpine wrapper, so it's built whenever the slot
    // itself is configured, not gated on `pages.length > 0`. This was
    // previously always hardcoded to null - composeLayout() never even
    // looked at `layout.body` - so a template's body-wrapper class/style
    // never reached any published site, for any page. Found live.
    layout.body ? slotDescriptor('bodyWrap', layout.body, options) : null,
  ])
  return { header, aside, main, footer, bodyWrap, notFound404, body }
}
