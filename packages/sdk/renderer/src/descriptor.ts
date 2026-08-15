// The render descriptor - a normalized, framework-agnostic representation of
// one element-tree node after data/image/link resolution (docs/plans/cms/
// headless-sdk-plan.md §2). Adapters (React, Vue, ...) turn descriptors into
// components; the raw `node` is carried along so consumers can read
// un-normalized config. Fully serializable (no functions, no classes), so it
// can cross an SSR boundary.

import type {
  WhoobeElementNode,
  ElementFormConfig,
  ElementSearchConfig,
  ElementSlider,
  ElementDataBinding,
  DynamicLinkBinding,
  FieldOption,
} from '@whoobe-cms/schema'

export interface RenderDescriptor {
  id: string
  /** Canonical registry key (see kind.ts). */
  kind: string
  /** Resolved HTML tag to render (e.g. 'h2', 'p', 'img'). */
  tag: string
  /** The raw node this descriptor came from. */
  node: WhoobeElementNode
  /** css.css + css.container (+ a valueMap transform's className). */
  className: string
  /** font-family (from `font`) + raw inline `style`. */
  style: string
  /** The node's data.attributes (DOM attributes for form fields, etc.). */
  attributes: Record<string, unknown>
  /** Raw data bag (data.attributes + data.options + anything else). */
  data: Record<string, unknown> | null
  /** Resolved display content - always safe to inject as HTML: bound values
   *  are escaped (and link transforms produce a sanitized <a>), static
   *  content passes through as authored. */
  content: string
  /** True when `content` may legitimately contain markup (bound values are
   *  escaped, so it is always safe either way). */
  contentIsHtml: boolean
  /** Resolved <img> src/alt, or null when nothing resolved. */
  image: { url: string; alt?: string | null } | null
  /** Resolved link wrapper (static `link` or per-record dynamicLink). */
  link: { href: string; target?: string; dynamic?: DynamicLinkBinding | null } | null
  /** 1-6 for heading kinds. */
  headingLevel?: number
  children: RenderDescriptor[]
  formConfig: ElementFormConfig | null
  searchConfig: ElementSearchConfig | null
  slider: ElementSlider | null
  dataBinding: ElementDataBinding | null
  /** Select/radiogroup options (from data.options). */
  options: FieldOption[] | null
}
