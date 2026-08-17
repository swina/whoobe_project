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
  animation: string | null
  ease: string | null
  duration: number
  delay: number
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
  successMessage: string
  errorMessage: string
  successRedirectUrl: string
  errorRedirectUrl: string
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
 *  dynamic slug pattern. */
export interface DynamicLinkBinding {
  targetPageId: string
  valueField: string
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
  content?: string
  css?: ElementCss
  style?: string
  font?: string
  image?: ElementImage
  /** Generic bag: `data.attributes` (DOM attrs, e.g. form input config) and
   *  `data.options` (select/radiogroup options). */
  data?: Record<string, any>
  dataBinding?: ElementDataBinding | null
  dynamicLink?: DynamicLinkBinding | null
  link?: string
  linkTarget?: string
  anchor?: string
  blocks?: WhoobeElementNode[]
  formConfig?: ElementFormConfig
  searchConfig?: ElementSearchConfig
  slider?: ElementSlider
  gsap?: ElementGsap
  alpine?: Record<string, unknown>
  theme?: { colors: { name: string; hex: string }[]; fonts: string[] }
  helper?: string | null
  editable?: boolean
  icon?: string
  label?: string
  tabLabel?: string
  src?: string
  placeholder?: string
  value?: string
  /** Per-node Tailwind utilities the SDK ignores but preserves on parse. */
  [key: string]: unknown
}
