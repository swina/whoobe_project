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

export function findNodeById(root: WhoobeElement, id: string): WhoobeElement | null {
  if (root.id === id) return root
  for (const child of root.blocks ?? []) {
    const found = findNodeById(child, id)
    if (found) return found
  }
  return null
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
