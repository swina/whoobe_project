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
  anchor: string
  image: ElementImage
  type: string
  tag: string
  editable: boolean
  icon: string
  helper: string | null
  dialog: string | null

  // Only present on nodes built via .Heading()/.Video()/input-family
  // builders - not part of the base shape, hence optional here.
  level?: number
  src?: string
  placeholder?: string
  value?: string
  label?: string
  semantic?: string
  action?: string
  success?: string
  error?: string
  element?: string

  randomID(): string
  Groups(): ElementGroup[]
  createElement(element: string, options?: Record<string, any>): Element | null

  setIcon(icon: string): this
  setTag(tag: string): this
  setCss(css: string): this
  setContent(content: string): this
  setImage(image: ElementImage): this
  setSemantic(semantic: string): this

  Grid(): this
  Cols(cols?: number): this
  Flexbox(options?: { direction?: string | null; colspan?: number | null }): this
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
  Icon(): this
  Iconify(): this
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
}
