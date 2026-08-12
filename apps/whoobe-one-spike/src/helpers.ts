// Replaces the handful of whoobe-one-studio `Vue.prototype.$x` global
// instance methods (src/scripts/index.js, editor.js) that Phase 0's three
// components actually call. The port plan (§2 item 2) flags two viable
// strategies - app.config.globalProperties (mechanical, zero call-site
// changes) or plain composable/imported functions. Since this spike is a
// fresh <script setup> rewrite rather than a line-by-line Options API port,
// plain imported functions are the more idiomatic Vue 3 choice and match
// this monorepo's existing whoobe-studio app's style - not carried forward
// as a deliberate architecture decision, just the natural fit here.
import type Element from './scripts/ElementsClass.js'
import type { Component } from 'vue'

type WhoobeElement = InstanceType<typeof Element>

/** Dedupes/collapses whitespace in a Tailwind class string (element.css.css/.container). */
export function clean(str: string = ''): string {
  if (!str) return ''
  str = str.replace(/\s\s+/g, ' ').trim()
  return [...new Set(str.split(' '))].join(' ')
}

/** Mirrors scripts/index.js's $imageURL, minus the env-prefixed relative-path
 * case (no backend asset URL exists in this standalone spike - every image
 * used here is a full URL). */
export function imageURL(image: { url?: string | null } | string | null | undefined): string | null {
  if (!image) return null
  return typeof image === 'string' ? image : image.url ?? null
}

export function randomID(prefix = 'whoobe'): string {
  return prefix + '-' + Math.random().toString(36).slice(2, 7)
}

/** Maps a live Element instance back to the builder name it was created
 * from (e.g. "Heading", "Paragraph", "Image") - the same canonical names
 * ElementsClass.js's own Groups() uses for the add-element palette
 * (BlockElementsPalette.vue), and createElement()'s own dispatch switches
 * on. Not stored on the node itself (createElement(name) discards `name`
 * once it's built the instance), so this reconstructs it from the
 * combination of fields that actually vary builder-to-builder - `tag` is
 * the primary discriminator (checked first) since most distinct builders
 * set a distinct tag; `level`/`type`/`element` break the remaining ties
 * (several builders share tag: 'element', the base constructor's own
 * default, e.g. Heading/Paragraph/InlineText/Span/Blockquote/Code all
 * leave `tag` untouched). Used by DocumentTreeNode.vue's own label and
 * FloatingToolbar.vue's selection badge - both previously showed either
 * the generic `tag` value ("element", true for six different builders at
 * once) or the raw HTML tag name, neither of which told these two builders
 * apart from each other. */
export function friendlyElementName(el: any): string {
  if (el.level) return 'Heading'

  switch (el.tag) {
    case 'grid':
      return 'Grid'
    case 'flex':
      return el.type === 'slider' ? 'Slider' : 'Flexbox'
    case 'youtube':
      return 'Youtube'
    case 'vimeo':
      return 'Vimeo'
    case 'lucideicon':
      return 'LucideIcon'
    case 'file':
      return 'Download'
    case 'form':
      return 'Form'
    case 'select':
      return 'Select'
    case 'submit':
      return 'Submit'
    case 'reset':
      return 'Reset'
    case 'button':
      return 'Button'
    case 'input':
      switch (el.type) {
        case 'email':
          return 'Email'
        case 'number':
          return 'Number'
        case 'hidden':
          return 'Hidden'
        case 'checkbox':
          return 'Checkbox'
        case 'textarea':
          return 'Textarea'
        default:
          return 'Input Text'
      }
  }

  switch (el.element) {
    case 'p':
      return 'Paragraph'
    case 'span':
      return 'Span'
    case 'blockquote':
      return 'Blockquote'
    case 'pre':
      return 'Code'
    case 'img':
      return 'Image'
    case 'video':
      return 'Video'
    case 'div':
      return 'Inline Text'
  }

  return el.semantic || el.element || 'Element'
}

export function findNodeById(root: WhoobeElement, id: string): WhoobeElement | null {
  if (root.id === id) return root
  for (const child of root.blocks ?? []) {
    const found = findNodeById(child, id)
    if (found) return found
  }
  return null
}

/** Returns every ancestor of `id`, ordered root-first, NOT including `id`
 *  itself. Used by FloatingToolbar.vue's "Link to a page" picker to find
 *  the nearest enclosing collection-bound container (walk the result in
 *  reverse - last entry is the immediate parent). */
export function findAncestorChain(root: WhoobeElement, id: string): WhoobeElement[] {
  function walk(node: WhoobeElement, path: WhoobeElement[]): WhoobeElement[] | null {
    if (node.id === id) return path
    for (const child of node.blocks ?? []) {
      const found = walk(child, [...path, node])
      if (found) return found
    }
    return null
  }
  return walk(root, []) ?? []
}

export function findParentAndIndex(
  root: WhoobeElement,
  id: string
): { parent: WhoobeElement; index: number } | null {
  for (let i = 0; i < (root.blocks?.length ?? 0); i++) {
    if (root.blocks[i].id === id) return { parent: root, index: i }
    const found = findParentAndIndex(root.blocks[i], id)
    if (found) return found
  }
  return null
}

/** Mirrors scripts/editor.js's $removeNode, operating on an explicit root
 * instead of the Vuex-held document (no global store coupling needed). */
export function removeNodeById(root: WhoobeElement, id: string): WhoobeElement | null {
  const found = findParentAndIndex(root, id)
  if (!found) return null
  const [node] = found.parent.blocks.splice(found.index, 1)
  return node
}

// A self-contained gray-box-with-mountain-icon SVG data URI - the generic
// "no image" placeholder look most editors show for an image element that
// has no source yet. Deliberately not baked into ElementsClass.js's own
// Image() builder (that file is a verbatim port, kept byte-for-byte
// identical to the source repo - see its own header) - applied here
// instead, at the one place *this* app creates new Image elements.
const PLACEHOLDER_IMAGE =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180">' +
      '<rect width="320" height="180" fill="#e5e7eb"/>' +
      '<path d="M40 130 L110 70 L150 105 L200 55 L280 130 Z" fill="#9ca3af"/>' +
      '<circle cx="100" cy="50" r="18" fill="#9ca3af"/>' +
      '</svg>'
  )

/** Gives a freshly-created Image element a visible placeholder instead of
 * an empty/broken <img> with no src - see the call site in
 * BlockEditor.vue's drop handler. */
export function applyImagePlaceholder(element: WhoobeElement): void {
  if (element.element === 'img' && !element.image?.url) {
    element.image = { url: PLACEHOLDER_IMAGE }
  }
}

// Attribute names that already have their own dedicated, authoritative
// binding on the rendered <component> in every canvas/preview renderer -
// `id`/`data-id` specifically are load-bearing for the canvas (selection,
// dragula, gsap-actions.ts's document.getElementById(element.id) lookup),
// so a user-typed custom attribute of the same name must never win.
export const RESERVED_ATTRS = ['id', 'class', 'style', 'data-id', 'data-type', 'ref']

/** Filters element.data.attributes down to what's safe to v-bind-spread
 * onto a rendered node - see AttributesControl.vue (the editing UI) and
 * RESERVED_ATTRS above. */
export function customAttrs(attributes: Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (!attributes) return {}
  const result: Record<string, unknown> = {}
  for (const key of Object.keys(attributes)) {
    if (RESERVED_ATTRS.includes(key)) continue
    result[key] = attributes[key]
  }
  return result
}

// LucideIcon element support (replaces the dead MIcon/Iconify element
// types - see ElementsClass.js's LucideIcon() builder). `@lucide/vue`
// exports every icon as a PascalCase named export plus a combined `icons`
// lookup map keyed the same way - no dynamicIconImports-style by-name
// loader exists in this package (that's a lucide-react-only feature), so
// resolving a user-typed string requires normalizing it into that exact
// PascalCase key ourselves.
//
// `icons` references every one of @lucide/vue's ~1750 icons at once (it's
// `import * as index from './icons/index.mjs'` internally) - unlike a
// named import of a handful of specific icons (which tree-shakes fine, and
// is how every other icon usage in this app works), there's no way to
// import just *some* of `icons` statically. A static top-level import of
// it here - in helpers.ts, a module loaded unconditionally by both the
// editor and every published page's BlockElementPreview.vue - measurably
// bloated the production build's main chunk (903KB -> 1.7MB gzip 289KB ->
// 429KB), paid by every visitor of every page regardless of whether it
// uses a LucideIcon element at all. A dynamic import() instead code-splits
// the whole icon set into its own chunk, fetched once (cached in-module)
// only the first time a LucideIcon element actually needs to resolve a
// name - resolveLucideIcon is async for exactly this reason; callers
// render a placeholder until the returned promise settles.
function toPascalCase(input: string): string {
  return input
    .trim()
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
    .join('')
}

let lucideIconsPromise: Promise<Record<string, Component>> | null = null
function loadLucideIcons(): Promise<Record<string, Component>> {
  if (!lucideIconsPromise) {
    lucideIconsPromise = import('@lucide/vue').then((m) => m.icons as unknown as Record<string, Component>)
  }
  return lucideIconsPromise
}

/** "arrow-right", "Arrow Right", "ARROW_RIGHT" all resolve to the same
 * `ArrowRight` icon component - falls back to HelpCircle for an empty or
 * unrecognized name, so a mistyped icon name is visibly wrong rather than
 * rendering nothing at all. */
export async function resolveLucideIcon(name: string | null | undefined): Promise<Component> {
  const icons = await loadLucideIcons()
  const key = toPascalCase(name ?? '')
  return icons[key] ?? icons.HelpCircle
}
