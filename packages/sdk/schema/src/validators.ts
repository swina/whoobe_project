// Zod runtime schemas for the Whoobe element tree (docs/plans/cms/headless-
// sdk-plan.md §1). Fetched trees are validated + normalized against these
// so a malformed or mutated tree fails loudly with a clear path instead of
// crashing a render. Node schemas use .passthrough() so unknown editor
// fields survive a round-trip unchanged.

import { z } from 'zod'
import type { WhoobeElementNode, ElementDataBinding, ElementFormConfig, ElementSearchConfig, ElementSlider, DynamicLinkBinding } from './node.js'

// --- primitives ---

export const elementCssSchema = z.object({
  css: z.string(),
  container: z.string(),
})

export const elementImageSchema = z.object({
  url: z.string().nullable().optional(),
  alt: z.string().nullable().optional(),
})

export const elementGsapSchema = z.object({
  animation: z.string().nullable(),
  ease: z.string().nullable(),
  duration: z.number(),
  delay: z.number(),
})

// --- form ---

export const formNotifySchema = z.object({
  enabled: z.boolean(),
  mailTemplateId: z.string(),
  templatePageId: z.string(),
  recipientEmail: z.string(),
  subject: z.string(),
})

export const formConfigSchema: z.ZodType<ElementFormConfig> = z.object({
  enabled: z.boolean(),
  targetClassId: z.string(),
  successMessage: z.string(),
  errorMessage: z.string(),
  successRedirectUrl: z.string(),
  errorRedirectUrl: z.string(),
  notify: formNotifySchema,
})

// --- search ---

export const searchConfigSchema: z.ZodType<ElementSearchConfig> = z.object({
  types: z.object({
    page: z.boolean(),
    object: z.boolean(),
    asset: z.boolean(),
  }),
  classIds: z.array(z.string()),
  dropdownClass: z.string().optional(),
  inputClass: z.string().optional(),
  buttonClass: z.string().optional(),
  buttonLabel: z.string().optional(),
  buttonIcon: z.boolean().optional(),
})

// --- data binding ---

export const dataBindingFilterSchema = z.object({
  field: z.string(),
  operator: z.enum(['eq', 'neq', 'in', 'contains', 'gt', 'lt']),
  value: z.unknown(),
  valueIsBinding: z.boolean().optional(),
})

export const dataBindingOrderBySchema = z.object({
  field: z.string(),
  direction: z.enum(['asc', 'desc']),
})

export const dataBindingSchema: z.ZodType<ElementDataBinding> = z.object({
  className: z.string(),
  objectId: z.string().nullable().optional(),
  field: z.string().nullable().optional(),
  fieldType: z.string().nullable().optional(),
  target: z.string(),
  dataKey: z.string().nullable().optional(),
  resolveMode: z.enum(['explicit', 'first', 'query', 'parent', 'currentPage']),
  filters: z.array(dataBindingFilterSchema).optional(),
  orderBy: dataBindingOrderBySchema.nullable().optional(),
  offset: z.number().nullable().optional(),
  limit: z.number().nullable().optional(),
  rowsPerPage: z.number().nullable().optional(),
  paginationMode: z.enum(['standard', 'lazyload']).nullable().optional(),
  loadMoreText: z.string().nullable().optional(),
  loadMoreClass: z.string().nullable().optional(),
  paginationContainerClass: z.string().nullable().optional(),
  locale: z.string().nullable().optional(),
  transform: z.discriminatedUnion('type', [
    z.object({ type: z.literal('none') }),
    z.object({ type: z.literal('date'), options: z.object({
      dateStyle: z.enum(['short', 'medium', 'long', 'full']),
      includeTime: z.boolean(),
    }) }),
    z.object({ type: z.literal('url'), options: z.object({
      linkText: z.enum(['value', 'custom']),
      customText: z.string().optional(),
      openInNewTab: z.boolean(),
    }) }),
    z.object({ type: z.literal('number'), options: z.object({
      style: z.enum(['decimal', 'currency', 'percent']),
      currency: z.string().optional(),
      minimumFractionDigits: z.number().optional(),
      maximumFractionDigits: z.number().optional(),
      useGrouping: z.boolean(),
    }) }),
    z.object({ type: z.literal('truncate'), options: z.object({
      maxLength: z.number(),
      ellipsis: z.string(),
    }) }),
    z.object({ type: z.literal('valueMap'), options: z.object({
      rules: z.array(z.object({ match: z.string(), label: z.string(), className: z.string() })),
      fallbackLabel: z.string(),
      fallbackClassName: z.string(),
    }) }),
  ]).nullable().optional(),
})

export const dynamicLinkSchema: z.ZodType<DynamicLinkBinding> = z.object({
  targetPageId: z.string(),
  valueField: z.string(),
})

// --- slider ---

export const sliderSchema: z.ZodType<ElementSlider> = z.object({
  autoplay: z.boolean(),
  interval: z.number(),
  loop: z.boolean(),
  showNav: z.boolean(),
  showHome: z.boolean(),
  mode: z.enum(['standard', 'tabs']).optional(),
  tabsPosition: z.enum(['above', 'below']).optional(),
  navClass: z.string().optional(),
  arrowClass: z.string().optional(),
  homeClass: z.string().optional(),
  tabClass: z.string().optional(),
  activeTabClass: z.string().optional(),
  arrowIcon: z.enum(['chevron', 'arrow', 'triangle']).optional(),
  homeIcon: z.enum(['home', 'dot', 'circle']).optional(),
})

// --- the node tree ---

export const whoobeElementSchema: z.ZodType<WhoobeElementNode> = z.lazy(() =>
  z
    .object({
      id: z.string(),
      type: z.string(),
      tag: z.string(),
      element: z.string().optional(),
      semantic: z.string().optional(),
      level: z.number().optional(),
      content: z.string().optional(),
      css: elementCssSchema.optional(),
      style: z.string().optional(),
      font: z.string().optional(),
      image: elementImageSchema.optional(),
      data: z.record(z.unknown()).optional(),
      dataBinding: dataBindingSchema.nullable().optional(),
      dynamicLink: dynamicLinkSchema.nullable().optional(),
      link: z.string().optional(),
      linkTarget: z.string().optional(),
      anchor: z.string().optional(),
      blocks: z.array(z.lazy(() => whoobeElementSchema)).default([]),
      formConfig: formConfigSchema.optional(),
      searchConfig: searchConfigSchema.optional(),
      slider: sliderSchema.optional(),
      gsap: elementGsapSchema.optional(),
      alpine: z.record(z.unknown()).optional(),
      theme: z.object({
        colors: z.array(z.object({ name: z.string(), hex: z.string() })),
        fonts: z.array(z.string()),
      }).optional(),
      helper: z.string().nullable().optional(),
      editable: z.boolean().optional(),
      icon: z.string().optional(),
      label: z.string().optional(),
      tabLabel: z.string().optional(),
      src: z.string().optional(),
      placeholder: z.string().optional(),
      value: z.string().optional(),
    })
    .passthrough(),
)

/** A published page's `content` is the root element node. */
export const pageContentSchema = whoobeElementSchema

/** Validates an element tree (or page content). Throws a ZodError with a
 *  clear path on invalid input; returns the parsed (normalized) node. */
export function validatePageContent(input: unknown): WhoobeElementNode {
  return whoobeElementSchema.parse(input)
}

/** Safe variant - returns null instead of throwing. */
export function parsePageContent(input: unknown): WhoobeElementNode | null {
  const result = whoobeElementSchema.safeParse(input)
  return result.success ? result.data : null
}
