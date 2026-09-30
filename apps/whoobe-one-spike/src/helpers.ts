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
import type { FieldOption } from './scripts/ElementsClass.js'
import type { Component } from 'vue'
import { escapeHtml } from './scripts/field-transforms'

type WhoobeElement = InstanceType<typeof Element>

/** CSS classes that hide elements in the published view but should be
 *  ignored in the editor canvas — the element stays visible and selectable,
 *  with a visual badge indicating it's hidden. */
export const EDITOR_HIDDEN_CLASSES = new Set(['hidden', 'invisible', 'sr-only'])

/** Strips editor-hidden classes from a class string and returns whether
 *  any were found. Used by BlockContainer/BlockElement to keep elements
 *  visible on the canvas while showing a "hidden" badge. */
export function stripEditorHidden(cls: string): { cleaned: string; hasHidden: boolean } {
  const parts = cls.split(/\s+/).filter(Boolean)
  const filtered: string[] = []
  let hasHidden = false
  for (const p of parts) {
    if (EDITOR_HIDDEN_CLASSES.has(p)) {
      hasHidden = true
    } else {
      filtered.push(p)
    }
  }
  return { cleaned: filtered.join(' '), hasHidden }
}

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
  if (el.name) return el.name
  if (el.level) return 'Heading'

  switch (el.tag) {
    case 'document':
      return 'Document'
    case 'grid':
      return 'Grid'
    case 'flex':
      return el.type === 'slider' ? 'Slider' : 'Flexbox'
    case 'slider':
      return 'Slider'
    case 'table':
      return 'Table'
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
    case 'radiogroup':
      return 'Radio Group'
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
      // Containers (Flexbox/Grid/plain div wrappers, the document root)
      // render as <div> but are NOT the InlineText builder - that leaf is
      // the only element that ever deserves the "Inline Text" label, and
      // only when it's still in its editable-text default state. Before
      // this distinction the tree (and floating toolbar) named every
      // container "Inline Text".
      if (el.type === 'container') return 'Container'
      if (el.editable) return 'Inline Text'
      return 'Div'
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
 * BlockEditor.vue's drop handler. Reads the global default placeholder URL
 * from `window.__whoobeDefaultPlaceholder` (set by Editor.vue on mount),
 * falling back to the hardcoded SVG when none is configured. */
export function applyImagePlaceholder(element: WhoobeElement): void {
  if (element.element === 'img' && !element.image?.url) {
    const customUrl = typeof window !== 'undefined' ? (window as any).__whoobeDefaultPlaceholder : null
    element.image = { url: customUrl || PLACEHOLDER_IMAGE }
  }
}

// AI-generated trees come back with `type` = the *builder* name
// ("Flexbox", "Heading", ...) and no `element` field at all - the prompt
// contract used to be silent on both (packages/core/src/ai/prompts.ts,
// since fixed to teach the model the real shape). The editor's render
// dispatch, however, is strict: BlockContainer.vue recurses only on
// `type === 'container'`, and BlockElement.vue renders the leaf's concrete
// HTML tag from `element` (`:is="el.element"` - undefined means Vue
// renders *nothing*). A generated page therefore landed in the document
// but was invisible on the canvas (the reported "AI page didn't show" bug;
// recoverable via the AI generations sidebar panel). This normalizer
// derives both fields from what the model does provide (tag + children),
// so old stored payloads and any model that ignores the contract still
// render. Recursive, mutates in place.
const TAG_TO_ELEMENT: Record<string, string> = {
  document: 'div', div: 'div', section: 'section', header: 'header', footer: 'footer',
  nav: 'nav', main: 'main', aside: 'aside', h1: 'h1', h2: 'h2', h3: 'h3', h4: 'h4',
  h5: 'h5', h6: 'h6', p: 'p', span: 'span', img: 'img', a: 'a', button: 'button',
  input: 'input', textarea: 'textarea', select: 'select', blockquote: 'blockquote',
  pre: 'pre', ul: 'ul', ol: 'ol', li: 'li', video: 'video', form: 'form', hr: 'hr',
}
export function normalizeGeneratedTree(node: any, options?: { replacePlaceholderImages?: boolean }): any {
  if (!node || typeof node !== 'object') return node
  const replacePlaceholderImages = options?.replacePlaceholderImages ?? true
  if (!node.element) node.element = TAG_TO_ELEMENT[node.tag] ?? 'div'
  // Same gap as `element` above: the AI prompt contract doesn't guarantee a
  // `css` object either, but every renderer/editing path in this app (the
  // canvas, Preview, FloatingToolbar.vue's style controls) assumes it's
  // always there the way `new Element()` (ElementsClass.js) guarantees for
  // manually-created elements - some of them assign into it directly
  // (`el.css.css = ...`) with no optional chaining at all. A generated node
  // missing it crashes rather than just rendering with no classes (the
  // reported "AI-generated element -> Preview" TypeError).
  if (!node.css || typeof node.css !== 'object') node.css = { css: '', container: '' }
  if (node.type !== 'container' && node.type !== 'element') {
    node.type = Array.isArray(node.blocks) && node.blocks.length ? 'container' : 'element'
  }
  // Same guarantee as the server's sanitizeGeneratedImages(): models invent
  // unsplash.com URLs whose photo IDs don't exist - swap any image URL for
  // a deterministic, always-valid placeholder so imported pages (incl. old
  // stored records) never render broken <img>s. Callers with real image
  // URLs (e.g. Figma imports) pass replacePlaceholderImages: false.
  if (replacePlaceholderImages && node.element === 'img' && node.image?.url) {
    node.image.url = `https://picsum.photos/seed/${node.id}/1200/800`
  }
  if (Array.isArray(node.blocks)) {
    for (const child of node.blocks) normalizeGeneratedTree(child, options)
  }
  return node
}

// Attribute names that already have their own dedicated, authoritative
// binding on the rendered <component> in every canvas/preview renderer -
// `id`/`data-id` specifically are load-bearing for the canvas (selection,
// dragula, gsap-actions.ts's document.getElementById(element.id) lookup),
// so a user-typed custom attribute of the same name must never win.
/** Element `element` values (BlockElement.vue's `props.element.element`,
 *  same field kind.ts's normalizeKind() switches on) whose HTML content
 *  model is "phrasing content" only - a real `<p>`/`<h1>`/`<span>` cannot
 *  legitimately contain a block-level child like `<div>`. `blockquote` is
 *  deliberately excluded: its content model is flow content, so nested
 *  divs/paragraphs are valid there. Used by stripBlockLevelTags() below to
 *  decide when to sanitize. */
export const PHRASING_ONLY_ELEMENTS = new Set(['p', 'h', 'span', 'pre'])

const BLOCK_LEVEL_TAGS = new Set([
  'DIV', 'P', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'MAIN', 'NAV', 'ASIDE',
  'UL', 'OL', 'LI', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TD', 'TH',
  'FORM', 'FIELDSET', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'PRE', 'HR', 'FIGURE', 'FIGCAPTION',
])

/** Unwraps any block-level tag out of a captured contenteditable HTML
 * string, keeping its inline content in place (with a `<br>` where the
 * block boundary was, so unwrapped content doesn't silently run into its
 * neighbor with zero separation). Native browser paste into a
 * `contenteditable` element does NOT enforce the target tag's real HTML
 * content model - pasting a `<div>` (from another site, Word, Google Docs,
 * or even another block copied within the editor) straight into a
 * `<p>`/`<h1>`/`<span>` succeeds silently in the DOM and gets captured
 * verbatim by BlockElement.vue's onBlur. The browser only enforces the
 * real content model when that HTML is later parsed fresh (a published
 * site's SSR/static output, or any `innerHTML =` assignment) - where it
 * auto-closes the `<p>` the moment it hits the nested block tag, silently
 * dropping/reordering content. Found live: a real paragraph in a
 * published site was missing its text because of exactly this. Call only
 * for a node whose own `element` is in PHRASING_ONLY_ELEMENTS. */
export function stripBlockLevelTags(html: string): string {
  const container = document.createElement('div')
  container.innerHTML = html
  // globalThis.Element, not this file's own `Element` (ElementsClass.js's
  // block-model type, imported above) - a plain DOM node here.
  const unwrap = (node: globalThis.Element) => {
    for (const child of Array.from(node.children)) {
      unwrap(child)
      if (BLOCK_LEVEL_TAGS.has(child.tagName)) {
        const frag = document.createDocumentFragment()
        while (child.firstChild) frag.appendChild(child.firstChild)
        frag.appendChild(document.createElement('br'))
        child.replaceWith(frag)
      }
    }
  }
  unwrap(container)
  return container.innerHTML
}

export const RESERVED_ATTRS = ['class', 'style', 'data-id', 'data-type', 'ref']

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

/**
 * Safeguards an AlpineJS directive value against common user mistakes. Alpine
 * evaluates directive values as JavaScript expressions, so a bare Tailwind
 * class like `h-[600px]` typed into the x-bind:class value field would throw
 * a SyntaxError at render time. When the value fails to parse as JS it's
 * silently wrapped in single quotes so it becomes a string literal - a
 * no-op fix that makes `x-bind:class="h-[600px]"` behave the way a non-
 * technical user expects it to (same as `class="h-[600px]"`).
 */
export function safeAlpineValue(value: string): string {
  try {
    new Function(`return ${value}`)
    return value
  } catch {
    return `'${value.replaceAll("'", "\\'")}'`
  }
}

// InputSelect() shipped a flat string[] (value === label) before this
// session's change added the real {label,value} shape - a Select element
// saved/dropped before that (e.g. already sitting in an open document) still
// has the old shape on disk, and nothing migrates it in place. Tolerating
// both here, rather than assuming every entry is a well-formed FieldOption
// object, is what keeps a pre-existing Select from crashing this computed
// (escapeHtml(undefined) throws) the moment it's rendered.
function normalizeOption(o: FieldOption | string | null | undefined): FieldOption {
  if (typeof o === 'string') return { label: o, value: o }
  return { label: o?.label ?? '', value: o?.value ?? '' }
}

/** A tag==='select' element's real <option> children - see ElementsClass.
 *  js's InputSelect() and FormFieldControl.vue (the sidebar editor for this
 *  list). Rendered as generated HTML into displayContent (BlockElement.vue/
 *  BlockElementPreview.vue), the same "content is sometimes a computed HTML
 *  string, not just element.content" convention already used for data-bound
 *  text/links there - a <select> was never a real editable-content element
 *  to begin with, so there's no static `element.content` this needs to
 *  coexist with. */
export function renderSelectOptionsHtml(options: (FieldOption | string)[] | undefined): string {
  if (!options || options.length === 0) return ''
  return options
    .map(normalizeOption)
    .map((o) => `<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`)
    .join('')
}

/** RadioGroup()'s own generated markup - one labeled <input type="radio">
 *  per option, all sharing `name` so the browser treats them as one
 *  mutually-exclusive group. `name` comes from the group's own
 *  data.attributes.name (set via AttributesControl.vue/FormFieldControl.
 *  vue), same field a real submission's FormData would key this value by. */
export function renderRadioGroupHtml(options: (FieldOption | string)[] | undefined, name: string | undefined): string {
  if (!options || options.length === 0) return ''
  const groupName = name || 'radiogroup'
  return options
    .map(normalizeOption)
    .map((o, i) => {
      const id = `${groupName}-${i}`
      return `<label for="${escapeHtml(id)}" class="flex items-center gap-1.5"><input type="radio" id="${escapeHtml(id)}" name="${escapeHtml(groupName)}" value="${escapeHtml(o.value)}"> ${escapeHtml(o.label)}</label>`
    })
    .join('')
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
    // Split on non-alphanumeric separators OR on lowercase→uppercase transitions
    // (handles both "arrow-right" and "arrowRight").
    .split(/[^a-zA-Z0-9]+|(?<=[a-z])(?=[A-Z])/)
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
