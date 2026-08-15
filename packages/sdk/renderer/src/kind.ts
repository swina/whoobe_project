// Node-kind normalization (docs/plans/cms/headless-sdk-plan.md §2) - maps a
// raw element-tree node to a stable `kind` (the component-registry key) and
// a resolved HTML `tag`. Mirrors the dispatch in whoobe-one-spike's
// BlockElementPreview.vue: `level` decides headings, and the `tag` field
// disambiguates specials that share an `element` (slider/youtube/vimeo/
// lucideicon/radiogroup/submit/reset are all `div`/`iframe`/`span`/`button`
// under the hood).

import type { WhoobeElementNode } from '@whoobe-cms/schema'

/** Canonical registry kind for a node - consumers map these to their own
 *  design-system components. */
export function normalizeKind(node: WhoobeElementNode): string {
  switch (node.tag) {
    case 'slider':
      return 'slider'
    case 'youtube':
      return 'youtube'
    case 'vimeo':
      return 'vimeo'
    case 'lucideicon':
      return 'icon'
    case 'radiogroup':
      return 'radiogroup'
    case 'submit':
      return 'submit'
    case 'reset':
      return 'reset'
    case 'form':
      return 'form'
    case 'search':
      return 'search'
    case 'select':
      return 'select'
    case 'file':
      return 'button'
  }
  switch (node.element) {
    case 'img':
      return 'image'
    case 'video':
      return 'video'
    case 'input':
      return 'input'
    case 'textarea':
      return 'textarea'
    case 'select':
      return 'select'
    case 'button':
      return 'button'
    case 'a':
      return 'link'
    case 'p':
      return 'paragraph'
    case 'h':
      return 'heading'
    case 'blockquote':
      return 'blockquote'
    case 'pre':
      return 'code'
    case 'span':
      return 'span'
  }
  // Any container (grid/flex/dropdown/section/...) or untyped node.
  return 'container'
}

/** The HTML tag to render (heading level resolved, containers honor their
 *  semantic tag, specials fall back to their `element`). */
export function resolveTag(node: WhoobeElementNode): string {
  if (node.element === 'h' && node.level != null) {
    const level = Number(node.level)
    return 'h' + (Number.isInteger(level) && level >= 1 && level <= 6 ? level : 1)
  }
  if (node.element === 'div' && node.semantic) return node.semantic
  return node.element || node.tag || 'div'
}
