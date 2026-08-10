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
    case 'micon':
      return 'MIcon'
    case 'iconify':
      return 'Iconify'
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
