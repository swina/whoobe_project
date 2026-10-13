// Zod runtime schemas for the Whoobe element tree (docs/plans/cms/headless-
// sdk-plan.md §1). Fetched trees are validated + normalized against these
// so a malformed or mutated tree fails loudly with a clear path instead of
// crashing a render. Node schemas use .passthrough() so unknown editor
// fields survive a round-trip unchanged.

import { z } from 'zod'
import type { ElementSelection } from './selection.js'
import type { WhoobeElementNode, ElementDataBinding, ElementFormConfig, ElementSearchConfig, ElementSlider, DynamicLinkBinding, GatewayBinding, ElementTable, TableCell, TableColumnConfig } from './node.js'

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
  duration: z.union([z.number(), z.string()]),
  delay: z.union([z.number(), z.string()]),
  trigger: z.boolean().nullable().optional(),
})

const selectionRef = z.object({ name: z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,31}$/), field: z.string().min(1).max(200) })
export const elementSelectionSchema = z.object({
  publish: selectionRef.nullable().optional(),
  listen: selectionRef.extend({ whenEmpty: z.enum(['none', 'all']).optional() }).nullable().optional(),
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
  gatewayEndpointName: z.string().optional(),
  gatewayRoutePath: z.string().optional(),
  gatewayBindingId: z.string().optional(),
  successMessage: z.string(),
  errorMessage: z.string(),
  successRedirectUrl: z.string(),
  errorRedirectUrl: z.string(),
  showResultMessage: z.boolean().optional(),
  name: z.string().max(80).optional(),
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

export const fieldTransformSchema = z.discriminatedUnion('type', [
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
]).nullable().optional()

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
  transform: fieldTransformSchema,
})

export const dynamicLinkSchema: z.ZodType<DynamicLinkBinding> = z.object({
  targetPageId: z.string(),
  valueField: z.string(),
  source: z.enum(['dataObject', 'gateway']).optional(),
})

// --- gateway binding ---
// Was previously validated only by whoobeElementSchema's .passthrough() -
// any shape survived. Explicit now so a malformed/tampered gatewayBinding
// fails page-save validation instead of reaching bind-page-content.ts.

export const gatewayBindingSchema: z.ZodType<GatewayBinding> = z.object({
  scope: z.enum(['item']).nullable().optional(),
  limit: z.number().nullable().optional(),
  endpointName: z.string().optional(),
  routePath: z.string().optional(),
  fieldPath: z.string(),
  params: z.record(z.string()).nullable().optional(),
  filters: z.array(dataBindingFilterSchema).nullable().optional(),
  transform: fieldTransformSchema,
  bindingId: z.string().optional(),
  rowsPerPage: z.number().nullable().optional(),
  paginationMode: z.enum(['standard', 'lazyload']).nullable().optional(),
  loadMoreText: z.string().nullable().optional(),
  loadMoreClass: z.string().nullable().optional(),
  paginationContainerClass: z.string().nullable().optional(),
})

// --- table ---
// Tolerant on purpose: tables saved by older editors have fewer fields and the editor may add more; only a wrong TYPE is refused.

const optStr = z.string().optional()
const optBool = z.boolean().optional()

export const tableCellSchema: z.ZodType<TableCell> = z.object({
  id: optStr,
  content: z.string().optional(),
  colspan: z.number().optional(),
  rowspan: z.number().optional(),
  merged: optBool,
  cellClass: optStr,
}).passthrough() as unknown as z.ZodType<TableCell>

export const tableColumnSchema: z.ZodType<TableColumnConfig> = z.object({
  id: z.string(),
  header: z.string(),
  field: z.string(),
  cellClass: optStr,
  headerCellClass: optStr,
  sortable: optBool,
  searchable: optBool,
  transform: fieldTransformSchema,
}).passthrough() as unknown as z.ZodType<TableColumnConfig>

export const tableSchema: z.ZodType<ElementTable> = z.object({
  cols: z.number().optional(),
  hasHeader: optBool,
  hasFooter: optBool,
  caption: optStr,
  header: z.array(tableCellSchema).optional(),
  body: z.array(z.array(tableCellSchema)).optional(),
  footer: z.array(tableCellSchema).optional(),
  headerRowClass: optStr,
  bodyRowClass: optStr,
  footerRowClass: optStr,
  headerCellClass: optStr,
  bodyCellClass: optStr,
  footerCellClass: optStr,
  columns: z.array(tableColumnSchema).optional(),
  emptyText: optStr,
  sortable: optBool,
  searchable: optBool,
  searchPlaceholder: optStr,
  searchClass: optStr,
  showCount: optBool,
  countText: optStr,
  countClass: optStr,
}).passthrough() as unknown as z.ZodType<ElementTable>

// --- slider ---

export const sliderSchema: z.ZodType<ElementSlider> = z.object({
  autoplay: z.boolean().optional(),
  interval: z.number().optional(),
  loop: z.boolean().optional(),
  showNav: z.boolean().optional(),
  showHome: z.boolean().optional(),
  showDots: z.boolean().optional(),
  mode: z.enum(['standard', 'tabs']).optional(),
  tabsPosition: z.enum(['above', 'below']).optional(),
  navClass: z.string().optional(),
  arrowClass: z.string().optional(),
  homeClass: z.string().optional(),
  arrowIcon: z.enum(['chevron', 'arrow', 'triangle']).optional(),
  homeIcon: z.enum(['home', 'dot', 'circle']).optional(),
  tabClass: z.string().optional(),
  activeTabClass: z.string().optional(),
  tabContainerClass: z.string().optional(),
  dotClass: z.string().optional(),
  activeDotClass: z.string().optional(),
  dotContainerClass: z.string().optional(),
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
      content: z.string().nullable().optional(),
      css: elementCssSchema.optional(),
      style: z.string().nullable().optional(),
      font: z.string().nullable().optional(),
      image: elementImageSchema.optional(),
      data: z.record(z.unknown()).optional(),
      dataBinding: dataBindingSchema.nullable().optional(),
      dynamicLink: dynamicLinkSchema.nullable().optional(),
      gatewayBinding: gatewayBindingSchema.nullable().optional(),
      link: z.string().nullable().optional(),
      linkTarget: z.string().nullable().optional(),
      anchor: z.string().nullable().optional(),
      blocks: z.array(z.lazy(() => whoobeElementSchema)).default([]),
      formConfig: formConfigSchema.optional(),
      searchConfig: searchConfigSchema.optional(),
      slider: sliderSchema.optional(),
      table: tableSchema.optional(),
      gsap: elementGsapSchema.optional(),
      // a malformed selection is dropped instead of making the whole page invalid: a published page must keep rendering
      selection: elementSelectionSchema.nullable().optional().catch(undefined) as unknown as z.ZodType<ElementSelection | null | undefined>,
      alpine: z.record(z.unknown()).optional(),
      theme: z.object({
        colors: z.array(z.object({ name: z.string(), hex: z.string() })),
        fonts: z.array(z.string()),
      }).optional(),
      helper: z.string().nullable().optional(),
      editable: z.boolean().optional(),
      icon: z.string().nullable().optional(),
      label: z.string().nullable().optional(),
      tabLabel: z.string().nullable().optional(),
      src: z.string().nullable().optional(),
      placeholder: z.string().nullable().optional(),
      value: z.string().nullable().optional(),
      name: z.string().nullable().optional(),
      description: z.string().nullable().optional(),
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
