// The render descriptor - a normalized, framework-agnostic representation of
// one element-tree node after data/image/link resolution (docs/plans/cms/
// headless-sdk-plan.md §2). Adapters (React, Vue, ...) turn descriptors into
// components; the raw `node` is carried along so consumers can read
// un-normalized config. Fully serializable (no functions, no classes), so it
// can cross an SSR boundary.

import type { TableDescriptor } from './table.js'
import type {
  WhoobeElementNode,
  ElementFormConfig,
  ElementSearchConfig,
  ElementSlider,
  ElementDataBinding,
  ElementGsap,
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
  /** Resolved display content - always safe to inject as HTML. */
  content: string
  /** True when `content` may legitimately contain markup. */
  contentIsHtml: boolean
  /** Resolved <img> src/alt, or null when nothing resolved. */
  image: { url: string; alt?: string | null } | null
  /** Resolved link wrapper (static `link` or per-record dynamicLink). */
  link: { href: string; target?: string; dynamic?: DynamicLinkBinding | null; /** a Download element: the browser saves the file instead of opening it */ download?: boolean } | null
  /** 1-6 for heading kinds. */
  headingLevel?: number
  children: RenderDescriptor[]
  formConfig: ElementFormConfig | null
  searchConfig: ElementSearchConfig | null
  slider: ElementSlider | null
  /** The Table element (kind 'table'): a typed grid, or one pre-formatted row per record of a bound list. Null for every other kind. */
  table: TableDescriptor | null
  dataBinding: ElementDataBinding | null
  /** Select/radiogroup options (from data.options). */
  options: FieldOption[] | null
  /** Animation configuration (GSAP). */
  gsap?: ElementGsap | null
  /** A container whose list depends on a selection (docs/plans/cms/linked-bindings.md, dynamic bindings): it is rendered without children and the
   *  adapter fills it in the browser (`resolveDynamicChildren`) when the selection changes. */
  dynamicList?: { selections: string[]; urlParams?: Record<string, string> }
}
