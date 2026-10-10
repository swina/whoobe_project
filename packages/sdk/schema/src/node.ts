// Canonical Whoobe element-tree data contract (docs/plans/cms/headless-sdk-
// plan.md §1). Framework-agnostic port of the shape apps/whoobe-one-spike's
// ElementsClass.js defines (see its .d.ts), as pure data interfaces - no
// Element class, no Vue, no methods. This is the JSON that whoobe_pages
// stores in `content` and that the headless SDK consumes.

export interface ElementCss {
  css: string
  container: string
}

export interface ElementImage {
  url?: string | null
  alt?: string | null
}

export interface ElementGsap {
  animation?: string | null
  ease?: string | null
  duration: number | string
  delay: number | string
}

/** Shared `data.options` shape for Select()/RadioGroup(). */
export interface FieldOption {
  label: string
  value: string
}

/** Optional notification email sent on top of the Data Object write.
 *  `mailTemplateId` is the primary reference (a mail_templates row);
 *  `templatePageId` is the legacy fallback (a whoobe_pages row). */
export interface ElementFormNotifyConfig {
  enabled: boolean
  mailTemplateId: string
  templatePageId: string
  recipientEmail: string
  subject: string
}

export interface ElementFormConfig {
  enabled: boolean
  targetClassId: string
  /** When set, submissions POST to this Gateway endpoint/route instead of
   *  creating a Data Object - targetClassId is ignored. Authoring-only
   *  (kept for the editor's own selection UI/preview); the public gateway
   *  submit route never reads these two, only gatewayBindingId. */
  gatewayEndpointName?: string
  gatewayRoutePath?: string
  /** Server-resolved at page-save time (core-api's bind-page-content.ts)
   *  from gatewayEndpointName/gatewayRoutePath - the opaque id a published
   *  site actually sends to POST /api/v1/gateway/submit. Absent until the
   *  page has been saved at least once with a gateway target configured. */
  gatewayBindingId?: string
  successMessage: string
  errorMessage: string
  successRedirectUrl: string
  errorRedirectUrl: string
  /** Show the success / error message popup after a submission. Absent = true. Turn it off when the page itself reacts to the
   *  `whoobe-form-result` event (docs/plans/automations/form-result-event.md). */
  showResultMessage?: boolean
  notify: ElementFormNotifyConfig
}

export interface ElementSearchConfig {
  types: {
    page: boolean
    object: boolean
    asset: boolean
  }
  /** Restrict object results to these classes (data_classes.id). */
  classIds: string[]
  dropdownClass?: string
  inputClass?: string
  buttonClass?: string
  buttonLabel?: string
  buttonIcon?: boolean
}

export interface DataBindingFilter {
  field: string
  operator: 'eq' | 'neq' | 'in' | 'contains' | 'gt' | 'lt'
  /** The literal compare value; may be absent when valueIsBinding supplies
   *  it (a resolved value from another binding). */
  value?: unknown
  valueIsBinding?: boolean
}

export interface DataBindingOrderBy {
  field: string
  direction: 'asc' | 'desc'
}

export interface ElementDataBinding {
  className: string
  objectId?: string | null
  field?: string | null
  /** Denormalized ClassFieldDefinition.fieldType, set at bind time. */
  fieldType?: string | null
  target: string
  dataKey?: string | null
  resolveMode: 'explicit' | 'first' | 'query' | 'parent' | 'currentPage'
  filters?: DataBindingFilter[]
  orderBy?: DataBindingOrderBy | null
  offset?: number | null
  limit?: number | null
  rowsPerPage?: number | null
  paginationMode?: 'standard' | 'lazyload' | null
  loadMoreText?: string | null
  loadMoreClass?: string | null
  paginationContainerClass?: string | null
  locale?: string | null
  transform?: import('./transform.js').FieldTransform | null
}

/** List-to-detail linking: builds a per-record detail URL by substituting
 *  `valueField`'s resolved value (on THIS record) into `targetPageId`'s
 *  dynamic slug pattern. `valueField` is a Data Class attribute name
 *  (source 'dataObject', the default) or a dot-path field on a gateway
 *  route's response schema (source 'gateway') - see walk.ts's
 *  resolveNodeLink() for how each is resolved against the current record. */
export interface DynamicLinkBinding {
  targetPageId: string
  valueField: string
  source?: 'dataObject' | 'gateway'
}

export interface GatewayBinding {
  /** Authoring-only - stripped from public content (core-api's
   *  sanitizePublicGatewayContent) once `bindingId` has been resolved, so a
   *  published site's own copy of this object never has these two. Present
   *  only inside the CMS (editor's current in-memory document, or content
   *  fetched through an authenticated endpoint), for the editor's own UI/
   *  preview to show the current selection. */
  endpointName?: string
  routePath?: string
  fieldPath: string
  params?: Record<string, string> | null
  /** Server-resolved at page-save time from endpointName/routePath/fieldPath/
   *  filters (core-api's bind-page-content.ts) - the opaque id a published
   *  site actually sends to POST /api/v1/gateway/resolve. Absent until the
   *  page has been saved at least once with this binding configured. The
   *  editor's own live preview (GatewayBindingPicker.vue/GatewayPanel.vue)
   *  ignores this and keeps using endpointName/routePath directly against
   *  the admin-authenticated /api/v1/gateway/preview-resolve. */
  bindingId?: string
  /** Only meaningful when fieldPath resolves to an array (a container
   *  repeater) - filters the resolved items server-side (apps/gateway's
   *  /api/v1/gateway/resolve) before rendering, since there's no upstream
   *  "WHERE clause" for an arbitrary third-party API. `field` is a dot-path
   *  relative to one array item (e.g. "category", never prefixed with
   *  fieldPath itself). All filters must match (AND), same operator
   *  vocabulary as DataBindingFilter for consistency. */
  filters?: DataBindingFilter[] | null
  transform?: import('./transform.js').FieldTransform | null
}

export interface ElementSlider {
  autoplay: boolean
  interval: number
  loop: boolean
  showNav: boolean
  showHome: boolean
  mode?: 'standard' | 'tabs'
  tabsPosition?: 'above' | 'below'
  navClass?: string
  arrowClass?: string
  homeClass?: string
  tabClass?: string
  activeTabClass?: string
  arrowIcon?: 'chevron' | 'arrow' | 'triangle'
  homeIcon?: 'home' | 'dot' | 'circle'
}

/** The canonical node. Nearly every field is optional because builders set
 *  only what they need and older saved trees may lack newer fields - the
 *  hard invariants are `id`, `type` and `tag`; `blocks` defaults to an
 *  empty array. */
export interface WhoobeElementNode {
  id: string
  type: string // 'element' | 'container'
  tag: string // 'document' | 'element' | 'form' | 'slider' | ...
  element?: string // 'p' | 'h1' | 'img' | 'div' | 'search' | ...
  semantic?: string
  level?: number
  content?: string | null
  css?: ElementCss
  style?: string | null
  font?: string | null
  image?: ElementImage
  /** Generic bag: `data.attributes` (DOM attrs, e.g. form input config) and
   *  `data.options` (select/radiogroup options). */
  data?: Record<string, any>
  dataBinding?: ElementDataBinding | null
  gatewayBinding?: GatewayBinding | null
  dynamicLink?: DynamicLinkBinding | null
  link?: string | null
  linkTarget?: string | null
  anchor?: string | null
  blocks?: WhoobeElementNode[]
  formConfig?: ElementFormConfig
  searchConfig?: ElementSearchConfig
  slider?: ElementSlider
  gsap?: ElementGsap
  alpine?: Record<string, unknown>
  theme?: { colors: { name: string; hex: string }[]; fonts: string[] }
  helper?: string | null
  editable?: boolean
  icon?: string | null
  label?: string | null
  tabLabel?: string | null
  src?: string | null
  placeholder?: string | null
  value?: string | null
  /** Per-node Tailwind utilities the SDK ignores but preserves on parse. */
  [key: string]: unknown
}
