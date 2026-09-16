// Hand-written type shim for the ElementsClass.js it sits next to - almost
// entirely a byte-for-byte port of the source repo, not modified to add
// types, with one deliberate exception: Button()/InputSubmit() now also
// set `editable = true` (see those methods' own comments - a real, fixed
// omission in the source, not a stylistic change). TS's own inference for
// an untyped .js class,
// when consumed elsewhere in strict mode, over-narrows dynamic fields to
// the literal type of their *first* assignment (e.g. `image = { url: null
// }` in the constructor infers `image: { url: null }`, not `{ url?:
// string | null }`; `Flexbox(options = { direction: null })`'s default
// parameter infers `direction: null`, not `string | null`) - a real
// consequence of "port unchanged," not a bug in this shim or the source.
// TypeScript uses a same-basename .d.ts next to a .js file as that file's
// authoritative declaration, so this is the standard fix for hand-typing
// legacy JS without touching it.
export interface ElementCss {
  css: string
  container: string
}

export interface ElementImage {
  url?: string | null
  // Not in the source's own image shape at all (its `<img>` there sets
  // `alt="element.image && element.image.alt?element.image.alt:element.
  // element"` - reading a field its own ElementsClass.js constructor never
  // actually declares either, so this app isn't unique in adding it
  // dynamically). Only meaningful for `element === 'img'`; harmless and
  // simply unused on a background-image element, since CSS backgrounds
  // have no `alt` concept in HTML at all.
  alt?: string | null
  assetId?: string | null
}

export interface ElementGroup {
  label: string
  elements: Array<{ name: string; icon: string }>
}

export interface ElementGsap {
  animation: string | null
  ease: string | null
  duration: number
  delay: number
  trigger?: boolean
}

// Shared `data.options` shape for Select()/RadioGroup() - see
// FormFieldControl.vue (the sidebar editor for this list) and helpers.ts's
// renderSelectOptionsHtml()/renderRadioGroupHtml() (what actually turns it
// into real <option>/<input type="radio"> markup).
export interface FieldOption {
  label: string
  value: string
}

// Optional notification email sent on top of the Data Object write - see
// docs/plans/forms/cms-forms.md's Phase 2 and docs/plans/forms/mail-templates.
// md. `mailTemplateId` is the primary reference (a mail_templates row,
// rendered by kind via sendMailFromTemplate()); `templatePageId` is the
// legacy fallback (a whoobe_pages row, renderMailTemplate()) kept so
// already-saved Forms keep working.
export interface ElementFormNotifyConfig {
  enabled: boolean
  mailTemplateId: string
  templatePageId: string
  recipientEmail: string
  subject: string
}

// Only present on nodes built via .Form() - see docs/plans/forms/cms-forms.
// md's "Plan". Replaces the old dead success/error/action fields.
export interface ElementFormConfig {
  enabled: boolean
  targetClassId: string
  successMessage: string
  errorMessage: string
  successRedirectUrl: string
  errorRedirectUrl: string
  notify: ElementFormNotifyConfig
}

// Only present on nodes built via .Search() - see docs/plans/search-engine/
// search-element-plan.md. Scopes the search box to certain document types
// (and, for objects, to specific classes).
export interface ElementSearchConfig {
  types: {
    page: boolean
    object: boolean
    asset: boolean
  }
  /** Restrict object results to these classes (data_classes.id); empty =
   *  all object classes. */
  classIds: string[]
  /** Tailwind classes for the live results dropdown; blank = no styling.
   *  The Search() builder pre-fills a default, editable/removable here. */
  dropdownClass?: string
  /** Tailwind classes for the search input; blank = no styling. */
  inputClass?: string
  /** Tailwind classes for the submit button; blank = no styling. */
  buttonClass?: string
  /** Submit button label text; default "Search". */
  buttonLabel?: string
  /** When true the submit button shows a search icon instead of the label
   *  text. */
  buttonIcon?: boolean
}

export interface GatewayBinding {
  endpointName: string
  routePath: string
  fieldPath: string
  params?: Record<string, string> | null
}

import type { FieldTransform } from './field-transforms.js'

export interface DataBindingFilter {
  field: string
  operator: 'eq' | 'neq' | 'in' | 'contains' | 'gt' | 'lt'
  value: unknown
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
  // Denormalized ClassFieldDefinition.fieldType, set at bind time
  // (DataObjectPicker.vue's confirm()) - lets the sidebar's "data binding"
  // transform picker (DataBindingTransformControl.vue) know which
  // transformers apply without re-fetching the data class. Absent on
  // bindings saved before this field existed.
  fieldType?: string | null
  target: string
  dataKey?: string | null
  resolveMode: 'explicit' | 'first' | 'query' | 'parent' | 'currentPage'
  filters?: DataBindingFilter[]
  // Sorts the resolved set before offset/limit/pagination are applied.
  // Meaningful for 'first' too (e.g. "the most-recently-updated record"),
  // not just 'query'.
  orderBy?: DataBindingOrderBy | null
  // 'query'-only (meaningless for a single-record 'first'/'explicit'
  // fetch): skip N records after ordering, before limit/pagination.
  offset?: number | null
  // 'query'-only: cap the total working-set size after offset.
  limit?: number | null
  // 'query'-only, client-side-pagination-only (never sent to the server).
  // 0/undefined means "no pagination, render the whole (offset+limit-
  // bounded) working set at once".
  rowsPerPage?: number | null
  // How pagination is presented when rowsPerPage > 0 and the resolved
  // working set is larger: 'standard' (Prev/Next arrows + page indicator,
  // the original behaviour) or 'lazyload' (rows are appended in batches to
  // the already-shown list, with a "shown / total" counter and a "More"
  // button on its own line). Absent/undefined = 'standard'.
  paginationMode?: 'standard' | 'lazyload' | null
  // 'lazyload'-only: label for the "More" button (default 'More').
  loadMoreText?: string | null
  // 'lazyload'-only: Tailwind classes for the "More" button. Default (when
  // unset) is a neutral outline button - configurable like every other
  // Tailwind string in the editor.
  loadMoreClass?: string | null
  // Tailwind classes for the pagination container itself (the block-level
  // wrapper on its own line under the list, in BOTH modes). Applies to the
  // whole pagination area - the counter and the More button / the arrows.
  // Default (when unset) is a centered, full-width flex column that always
  // sits on its own line.
  paginationContainerClass?: string | null
  locale?: string | null
  // Configured from the sidebar (DataBindingTransformControl.vue), not the
  // bind modal - absent/undefined on all pre-existing saved bindings.
  transform?: FieldTransform | null
}

// List-to-detail linking (docs/plans/website/website-paths.md) - lets an
// element inside a collection-bound container link to a per-record detail
// URL, built by substituting `valueField`'s resolved value (on THIS
// record) into `targetPageId`'s own dynamic slug pattern. Not reusable as
// plain `link`/`linkTarget` below: those are flat strings, the same for
// every repeated record - this needs to vary per iteration, computed in
// BlockContainerPreview.vue's repeater (childHref()).
export interface DynamicLinkBinding {
  targetPageId: string
  // Interpreted differently per `source`: a Data Class attribute name
  // (dataObject, the original/default) or a dot-path field on the
  // gateway route's response schema (gateway) - see resolveNodeLink()
  // in packages/sdk/renderer/src/walk.ts and BlockContainerPreview.vue's
  // resolveDynamicLinkTarget() for how each is resolved against the
  // CURRENT record.
  valueField: string
  // Which kind of bound list this element sits inside. Optional and
  // defaults to 'dataObject' for content saved before this existed -
  // that was the only source dynamicLink ever supported.
  source?: 'dataObject' | 'gateway'
}

// Only present on nodes built via .Slider() - a full redesign, not a port
// (see that method's own comment in ElementsClass.js). Read by preview/
// BlockSliderPreview.vue and set via FloatingToolbar.vue's slider settings
// popover.
export interface ElementSlider {
  autoplay: boolean
  interval: number
  loop: boolean
  showNav: boolean
  showHome: boolean
  showDots?: boolean
  // 'standard' (the original arrows/home nav) or 'tabs' (a row of user-
  // named tabs, one per slide - see BlockSlider.vue/BlockSliderPreview.vue
  // for how each mode renders). Added later, so this is `?` rather than
  // required - a slider saved before this existed simply has no `mode` at
  // all, and both components default a missing one to 'standard'.
  mode?: 'standard' | 'tabs'
  // 'tabs' mode only: whether the named tab row sits above or below the
  // slide viewport, in normal document flow (not an overlay, unlike the
  // arrows/home in 'standard' mode - a full tab row would obscure too much
  // of the slide content sitting on top of it). Defaults to 'below'.
  tabsPosition?: 'above' | 'below'
  // Preview-only styling knobs, all free-text Tailwind classes - each one's
  // default (set in ElementsClass.js's Slider() builder) is the full class
  // list that part used to have hardcoded, and the component applies ONLY
  // whatever this field currently holds, never a hardcoded string alongside
  // it. Deliberately NOT additive (an earlier version layered a custom
  // class string over hardcoded defaults, the same pattern
  // CustomClassesControl.vue uses for an arbitrary node) - a real, reported
  // bug: two Tailwind utilities that set the *same* CSS property resolve by
  // Tailwind's own internal generated-stylesheet order, not by which class
  // appears later in the `class` attribute, so some custom overrides
  // silently won (by accident of Tailwind's internal sort) while others
  // silently lost - see Slider()'s own comment for the concrete example
  // that surfaced this. A single field with a real default sidesteps the
  // conflict entirely instead of trying to win it.
  navClass?: string
  arrowClass?: string
  homeClass?: string
  tabClass?: string
  activeTabClass?: string
  tabContainerClass?: string
  dotClass?: string
  activeDotClass?: string
  dotContainerClass?: string
  // 'standard' mode only: which built-in SVG shape (SliderNavIcon.vue)
  // draws the prev/next buttons (mirrored left/right) and the home button.
  // Defaults to 'chevron'/'home' respectively - the same visual look this
  // slider always had, just now a real restyleable icon instead of a fixed
  // ‹ › ⌂ unicode glyph.
  arrowIcon?: 'chevron' | 'arrow' | 'triangle'
  homeIcon?: 'home' | 'dot' | 'circle'
}

export default class Element {
  id: string
  blocks: Element[]
  css: ElementCss
  tailwind: Record<string, unknown>
  font: string
  style: string
  content: string
  description: string
  categories: string[]
  alpine: Record<string, unknown>
  events: Record<string, unknown>
  data: Record<string, any>
  gsap: ElementGsap
  link: string
  // Not in the source at all - FloatingToolbar.vue's Link popover assigns
  // this dynamically (same way `image`/`gsap.animation` already are), so
  // it's genuinely optional/absent until a link with a non-default target
  // is actually set, unlike the base fields above the constructor always
  // initializes.
  linkTarget?: string
  // List-to-detail linking (see DynamicLinkBinding above) - set via
  // FloatingToolbar.vue's Link popover's "Link to a page" mode, mutually
  // exclusive with `link`/`linkTarget` on the same element (setting one
  // clears the other, so there's one unambiguous source of truth).
  dynamicLink?: DynamicLinkBinding | null
  anchor: string
  slider?: ElementSlider
  // Not in the source, and not set by any builder - only meaningful on a
  // node that's a direct child (slide) of a `tag === 'slider'` container
  // whose own `slider.mode === 'tabs'`. Assigned dynamically by
  // BlockSlider.vue's rename action, same treatment as `linkTarget`/`alt`
  // above; falls back to a plain "Slide N" wherever it's read unset.
  name?: string
  tabLabel?: string
  // Not in the source, and not set by any builder - only meaningful on the
  // document root (the top-level Element returned by editor.document,
  // itself just an Element like any other node). Per-page design tokens
  // (this session's color-system fix): named custom hex colors and a
  // curated font list, both lazily created the first time ThemeModal.vue's
  // "add color"/"add font" actions actually need somewhere to write -
  // absent on any document that's never opened that modal, same "absent
  // until actually set" treatment as `linkTarget`/`tabLabel` above. Read
  // defensively (`document?.theme?.colors ?? []`) everywhere it's
  // consumed (ColorControl.vue's swatches, FontControl.vue's font list).
  theme?: { colors: { name: string; hex: string }[]; fonts: string[] }
  image: ElementImage
  type: string
  tag: string
  editable: boolean
  icon: string
  buttonIcon?: string
  buttonIconWidth?: number
  buttonIconHeight?: number
  helper: string | null
  dialog: string | null
  dataBinding?: ElementDataBinding | null
  gatewayBinding?: GatewayBinding | null

  // Only present on nodes built via .Heading()/.Video()/input-family
  // builders - not part of the base shape, hence optional here.
  level?: number
  src?: string
  placeholder?: string
  value?: string
  label?: string
  semantic?: string
  element?: string
  formConfig?: ElementFormConfig

  randomID(): string
  Groups(): ElementGroup[]
  createElement(element: string, options?: Record<string, any>): Element | null

  setIcon(icon: string): this
  setTag(tag: string): this
  setCss(css: string): this
  setContent(content: string): this
  setImage(image: ElementImage): this
  setSemantic(semantic: string): this
  setDataBinding(dataBinding: ElementDataBinding | null): this

  Grid(): this
  Cols(cols?: number): this
  Flexbox(options?: { direction?: string | null; colspan?: number | null }): this
  DropdownMenu(): this
  Slider(): this
  Heading(level?: number): this
  Paragraph(): this
  InlineText(): this
  Span(): this
  Blockquote(): this
  Code(): this
  Image(): this
  Video(): this
  YTVideo(): this
  VimeoVideo(): this
  LucideIcon(): this
  Download(): this
  Form(): this
  inputElement(): this
  InputText(): this
  InputEmail(): this
  InputNumber(): this
  InputHidden(): this
  InputCheckbox(): this
  InputTextarea(): this
  InputSelect(): this
  InputSubmit(): this
  InputReset(): this
  Button(): this
  Search(): this
  BottomNavigation(): this
  bottomNav?: ElementBottomNav
}

export interface BottomNavItem {
  id: string
  label: string
  icon: string
  link: string
  active: boolean
}

export interface ElementBottomNav {
  items: BottomNavItem[]
  activeColor: string
  inactiveColor: string
  backgroundColor: string
}
