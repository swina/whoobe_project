"use client"
// Built-in default components for every primitive node kind, so a page
// renders with an empty registry. Consumers override any kind via the
// registry to map it to their own design-system component.

import { Children, useState, useEffect, useRef, useCallback, createElement, type FormEvent, type ReactNode } from 'react'
import { sanitizeRichText } from '@whoobe-cms/schema'
import * as LucideIcons from 'lucide-react'
import { collectFormValues, dispatchFormResult, mountAnimation, sliderView, sanitizeOutcome, showsResultMessage, hidesFormOnSuccess, submitErrorMessage, type RenderDescriptor } from '@whoobe-cms/renderer'
import { useWhoobe } from './context.js'
import type { NodeComponent } from './types.js'
import { DefaultTable } from './table.js'

// Resolves a Lucide icon by name synchronously (mirrors
// apps/whoobe-one-spike/src/helpers.ts's resolveLucideIcon, which is async
// - fine there since that app is a pure client SPA, never SSR/static-
// exported). A published site's icon/buttonIcon elements render server-side
// (SSR) or at build time (static export) - "use client" above only affects
// the RSC bundling boundary, Next still SSRs a client component's initial
// HTML - so a useEffect-gated dynamic import (the previous approach here)
// never fires before that HTML is produced, permanently showing the
// fallback (the icon's raw name as text) instead of the SVG. lucide-react's
// module already is the full icon set regardless; importing it at module
// scope costs nothing beyond what the async version already paid for -
// just synchronously, so SSR output is correct on the very first render.
function toPascalCase(input: string): string {
  return input
    .trim()
    .split(/[^a-zA-Z0-9]+|(?<=[a-z])(?=[A-Z])/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
    .join('')
}

function resolveLucideIcon(name: string | null | undefined): any {
  const key = toPascalCase(name ?? '')
  return (LucideIcons as any)[key] ?? (LucideIcons as any).HelpCircle
}

export { cssToReactStyle, baseProps } from './style.js'
import { baseProps } from './style.js'

/** Wraps children in <a> when the descriptor has a link. */
function withLink(descriptor: RenderDescriptor, children: ReactNode, props?: Record<string, unknown>): ReactNode {
  if (descriptor.link) {
    return (
      <a href={descriptor.link.href} target={descriptor.link.target} {...(props ?? baseProps(descriptor))}>
        {children}
      </a>
    )
  }
  return children
}

/** Plays the element's animation (`node.gsap`): on scroll into view, or on hover when `trigger` is set. Shared module of @whoobe-cms/renderer. */
function useGsapAnimation(descriptor: RenderDescriptor, ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const config = (descriptor.node as any)?.gsap
    const el = ref.current
    if (!config?.animation || !el) return
    return mountAnimation(el, config)
  }, [ref])
}

/** Container (grid/flex/section/...): resolves the tag + class/style + children. */
export const DefaultContainer: NodeComponent = ({ descriptor, children }) => {
  const rootRef = useRef<HTMLElement | null>(null)
  const Tag = descriptor.tag as any
  useGsapAnimation(descriptor, rootRef)
  return <Tag ref={rootRef} {...baseProps(descriptor)}>{withLink(descriptor, children)}</Tag>
}

/** Text nodes (heading/paragraph/span/blockquote/code): safe HTML. */
export function makeTextComponent(name: string): NodeComponent {
  const TextComponent: NodeComponent = ({ descriptor }) => {
    const rootRef = useRef<HTMLElement | null>(null)
    const Tag = descriptor.tag as any
    useGsapAnimation(descriptor, rootRef)
    return (
      <Tag
        ref={rootRef}
        {...baseProps(descriptor)}
        dangerouslySetInnerHTML={descriptor.content ? { __html: sanitizeRichText(descriptor.content) } : undefined}
      />
    )
  }
  TextComponent.displayName = name
  return TextComponent
}

export const DefaultHeading = makeTextComponent('WhoobeHeading')
export const DefaultParagraph = makeTextComponent('WhoobeParagraph')
export const DefaultSpan = makeTextComponent('WhoobeSpan')
export const DefaultBlockquote = makeTextComponent('WhoobeBlockquote')
export const DefaultCode = makeTextComponent('WhoobeCode')

/** Lucide icon — resolved synchronously (see resolveLucideIcon above). */
export const DefaultIcon: NodeComponent = ({ descriptor }) => {
  const IconComp = resolveLucideIcon(descriptor.content)
  const Tag = descriptor.tag as any
  const bp = baseProps(descriptor)
  return <Tag {...bp}>{withLink(descriptor, createElement(IconComp as any))}</Tag>
}

/** Image: resolved src/alt (DAM references already resolved by the renderer). */
export const DefaultImage: NodeComponent = ({ descriptor }) => {
  if (!descriptor.image) return null
  const img = <img src={descriptor.image.url} alt={descriptor.image.alt ?? ''} {...baseProps(descriptor)} />
  return withLink(descriptor, img) as React.ReactElement
}

/** Link: wraps children in the resolved href/target. */
export const DefaultLink: NodeComponent = ({ descriptor, children }) => {
  const bp = baseProps(descriptor)
  // a link that is a leaf (an `a` element with its text in `content`, no child) shows that text
  const leaf = !(Array.isArray(children) ? children.length : children) && descriptor.content
  const inner = leaf ? { dangerouslySetInnerHTML: { __html: sanitizeRichText(descriptor.content as string) } } : { children }
  if (descriptor.link) {
    return <a href={descriptor.link.href} target={descriptor.link.target} {...bp} {...inner} />
  }
  return <span {...bp} {...inner} />
}

// --- form fields ---

function fieldProps(d: RenderDescriptor): Record<string, unknown> {
  return baseProps(d)
}

export const DefaultInput: NodeComponent = ({ descriptor }) => <input {...fieldProps(descriptor)} />

export const DefaultTextarea: NodeComponent = ({ descriptor }) => (
  <textarea {...fieldProps(descriptor)}>{descriptor.content || undefined}</textarea>
)

export const DefaultSelect: NodeComponent = ({ descriptor }) => (
  <select {...fieldProps(descriptor)}>
    {(descriptor.options ?? []).map((o) => (
      <option key={o.value} value={o.value}>{o.label}</option>
    ))}
  </select>
)

export const DefaultRadioGroup: NodeComponent = ({ descriptor }) => {
  const name = (descriptor.attributes.name as string) ?? ''
  return (
    <div {...fieldProps(descriptor)}>
      {(descriptor.options ?? []).map((o) => (
        <label key={o.value} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginRight: 8 }}>
          <input type="radio" name={name} value={o.value} />
          {o.label}
        </label>
      ))}
    </div>
  )
}

/** Button with optional Lucide icon (before/after the label, matching the
 *  editor's own markup - BlockElementPreview.vue's buttonIcon/
 *  buttonIconPosition/buttonIconWidth/buttonIconHeight) + link support. */
function buttonWithIcon(descriptor: RenderDescriptor, type: 'button' | 'submit' | 'reset', defaultContent: string): ReactNode {
  const node = descriptor.node as Record<string, unknown> | undefined
  const buttonIcon = (node?.buttonIcon as string) ?? ''
  const position = (node?.buttonIconPosition as string) ?? 'before'
  const iconWidth = (node?.buttonIconWidth as number) ?? 16
  const iconHeight = (node?.buttonIconHeight as number) ?? 16
  const bp = fieldProps(descriptor) as Record<string, unknown>
  const content = descriptor.content || defaultContent
  const icon = buttonIcon ? <ButtonIcon name={buttonIcon} width={iconWidth} height={iconHeight} position={position} /> : null

  const inner = (
    <>
      {position !== 'after' ? icon : null}
      {content}
      {position === 'after' ? icon : null}
    </>
  )

  if (descriptor.link) {
    return <a href={descriptor.link.href} target={descriptor.link.target} download={descriptor.link.download ? '' : undefined} {...bp} className={(bp.className as string) + ' inline-flex items-center'}>{inner}</a>
  }
  return <button {...bp} type={type}>{inner}</button>
}

function ButtonIcon({ name, width, height, position }: { name: string; width: number; height: number; position: string }) {
  const IconComp = resolveLucideIcon(name)
  return (
    <span className={`inline-flex items-center ${position === 'after' ? 'ml-1.5' : 'mr-1.5'}`}>
      <IconComp style={{ width, height }} />
    </span>
  )
}

export const DefaultButton: NodeComponent = ({ descriptor }) => buttonWithIcon(descriptor, 'button', '') as React.ReactElement
export const DefaultSubmit: NodeComponent = ({ descriptor }) => buttonWithIcon(descriptor, 'submit', 'Submit') as React.ReactElement
export const DefaultReset: NodeComponent = ({ descriptor }) => buttonWithIcon(descriptor, 'reset', 'Reset') as React.ReactElement

/** Form: fields inside a <form>, submits to /public/forms/:classId/submit. */
export const DefaultForm: NodeComponent = ({ descriptor, children }) => {
  const ctx = useWhoobe()
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [sent, setSent] = useState(false)

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fc = descriptor.formConfig
    if (!fc) return
    const formEl = e.currentTarget
    try {
      const attributes = await collectFormValues(formEl, ctx.api.uploadFile?.bind(ctx.api))
      const reply = await ctx.api.submitForm(fc.targetClassId, attributes, {
        notify: fc.notify,
        gatewayBindingId: fc.gatewayBindingId,
      })
      formEl.reset()
      if (hidesFormOnSuccess(fc)) setSent(true)
      setResult(showsResultMessage(fc) ? { ok: true, message: fc.successMessage || 'Submitted.' } : null)
      dispatchFormResult(formEl, { ok: true, outcome: sanitizeOutcome(reply?.outcome) })
    } catch (err) {
      setResult(showsResultMessage(fc) ? { ok: false, message: submitErrorMessage(err, fc.errorMessage) } : null)
      dispatchFormResult(formEl, { ok: false, outcome: null })
    }
  }

  // "Hide the form once it has been sent": the fields go at once; the form's own box goes when the message popup (inside it) is closed
  const base = baseProps(descriptor)
  const formProps = sent && !result ? { ...base, style: { ...(base.style as object | undefined), display: 'none' } } : base

  return (
    <form {...formProps} onSubmit={onSubmit}>
      <input name="_hp" type="text" tabIndex={-1} autoComplete="off" aria-hidden="true"
        style={{ position: 'absolute', left: -9999, width: 1, height: 1, overflow: 'hidden' }} />
      {!sent && children}
      {result && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100000, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, cursor: 'pointer' }}
          onClick={() => setResult(null)}>
          <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 20px 40px rgba(0,0,0,.2)', maxWidth: 448, width: '100%', padding: 24, fontSize: 14, color: result.ok ? '#047857' : '#be123c' }}
            dangerouslySetInnerHTML={{ __html: sanitizeRichText(result.message) }} />
        </div>
      )}
    </form>
  )
}

/** Search: input + submit wired to /public/search. */
export const DefaultSearch: NodeComponent = ({ descriptor }) => {
  const ctx = useWhoobe()
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Record<string, unknown>[]>([])

  async function run(e: FormEvent) {
    e.preventDefault()
    const res = await ctx.api.search({ q })
    setResults(((res as { results?: Record<string, unknown>[] }).results ?? []) as Record<string, unknown>[])
  }

  return (
    <form {...baseProps(descriptor)} onSubmit={run}>
      <input {...(descriptor.attributes as Record<string, unknown>)} value={q} onChange={(e) => setQ(e.target.value)} />
      <button type="submit">{descriptor.searchConfig?.buttonLabel || 'Search'}</button>
      {results.length > 0 && (
        <ul className={descriptor.searchConfig?.dropdownClass}>
          {results.map((r, i) => <li key={i}>{String(r.title ?? r.name ?? r.id)}</li>)}
        </ul>
      )}
    </form>
  )
}

// --- media ---

export const DefaultVideo: NodeComponent = ({ descriptor }) => (
  <video {...fieldProps(descriptor)} src={descriptor.image?.url ?? descriptor.node.src ?? undefined} controls />
)

// Audio: the plain browser player, from the element's `options` (controls, loop, autoplay, preload). The 'waveform'
// look of the editor needs browser code the SDK does not ship: the node is marked data-whoobe-audio="waveform" so a
// consumer's own component (registry `audio`) can draw one; otherwise visitors get the plain player.
export const DefaultAudio: NodeComponent = ({ descriptor }) => {
  const o = ((descriptor.node as { options?: Record<string, unknown> }).options ?? {}) as Record<string, unknown>
  return (
    <audio
      {...baseProps(descriptor)}
      src={descriptor.image?.url ?? descriptor.node.src ?? undefined}
      controls={o.controls !== false}
      loop={o.loop === true}
      autoPlay={o.autoplay === true}
      preload={o.preload === 'none' || o.preload === 'auto' ? (o.preload as string) : 'metadata'}
      data-whoobe-audio={o.mode === 'waveform' ? 'waveform' : undefined}
    />
  )
}

export const DefaultYoutube: NodeComponent = ({ descriptor }) => (
  <div {...baseProps(descriptor)} data-embed="youtube">{descriptor.content || 'YouTube'}</div>
)

export const DefaultVimeo: NodeComponent = ({ descriptor }) => (
  <div {...baseProps(descriptor)} data-embed="vimeo">{descriptor.content || 'Vimeo'}</div>
)

// --- slider ---
// Same behaviour as the editor's preview: the slides are the node's children (rendered by WhoobeNode, passed in as `children`), the tab
// row is named from each slide's `tabLabel`, and which of tabs / arrows / home / dots appear comes from sliderView() (shared by the adapters).

export const DefaultSlider: NodeComponent = ({ descriptor, children }) => {
  const slides = Children.toArray(children)
  const view = sliderView(descriptor, descriptor.children)
  const s = view.settings
  const total = slides.length
  const [current, setCurrent] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const goTo = useCallback((i: number) => {
    if (s.loop) setCurrent(((i % total) + total) % total)
    else setCurrent(Math.max(0, Math.min(i, total - 1)))
  }, [total, s.loop])

  const next = useCallback(() => goTo(current + 1), [current, goTo])
  const prev = useCallback(() => goTo(current - 1), [current, goTo])

  // a manual move restarts the autoplay countdown (the interval is rebuilt whenever `current` changes through next)
  useEffect(() => {
    if (!s.autoplay || total <= 1) return
    timerRef.current = setInterval(next, Math.max(500, Number(s.interval) || 5000))
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [s.autoplay, s.interval, next, total])

  // Deep-link support: `/features#slide2` (also `#slide-2`, `#slide_2`, 1-based) jumps to that slide. Applied in an effect, not in the
  // initial state, so the server markup always starts at slide 0 and hydration matches. Every slider of the page reacts to the same hash.
  useEffect(() => {
    if (typeof window === 'undefined' || total === 0) return
    const applyHashSlide = () => {
      const match = /^#?slide[-_]?(\d+)$/i.exec(window.location.hash)
      if (!match) return
      setCurrent(Math.max(0, Math.min(parseInt(match[1], 10) - 1, total - 1)))
    }
    applyHashSlide()
    window.addEventListener('hashchange', applyHashSlide)
    return () => window.removeEventListener('hashchange', applyHashSlide)
  }, [total])

  if (total === 0) return <div {...baseProps(descriptor)} />

  const tabRow = (
    <div className={view.tabsClass}>
      {view.labels.map((label, i) => (
        <button key={i} type="button" onClick={() => goTo(i)} className={i === current ? s.activeTabClass : s.tabClass}>{label}</button>
      ))}
    </div>
  )
  const overlay = { position: 'absolute' as const }

  return (
    <div {...baseProps(descriptor)} data-slider="true">
      {view.tabs === 'above' && tabRow}
      <div style={{ position: 'relative' }}>
        <div style={{ overflow: 'hidden' }}>
          <div style={{ display: 'flex', transition: 'transform 0.5s ease-out', transform: `translateX(-${current * 100}%)` }}>
            {slides.map((slide, i) => (
              <div key={i} style={{ width: '100%', flexShrink: 0 }}>{slide}</div>
            ))}
          </div>
        </div>
        {view.arrows && (
          <>
            <button type="button" aria-label="Previous slide" onClick={prev} className={s.arrowClass} style={{ ...overlay, left: 8, top: '50%', transform: 'translateY(-50%)' }}>{view.glyphs.prev}</button>
            <button type="button" aria-label="Next slide" onClick={next} className={s.arrowClass} style={{ ...overlay, right: 8, top: '50%', transform: 'translateY(-50%)' }}>{view.glyphs.next}</button>
          </>
        )}
        {view.home && (
          <button type="button" aria-label="First slide" onClick={() => goTo(0)} className={s.homeClass} style={{ ...overlay, bottom: 8, left: '50%', transform: 'translateX(-50%)' }}>{view.glyphs.home}</button>
        )}
        {view.dots && (
          <div className={s.dotContainerClass}>
            {slides.map((_, i) => (
              <button key={i} type="button" aria-label={`Go to slide ${i + 1}`} onClick={() => goTo(i)} className={i === current ? s.activeDotClass : s.dotClass} />
            ))}
          </div>
        )}
      </div>
      {view.tabs === 'below' && tabRow}
    </div>
  )
}

export const defaults: Record<string, NodeComponent> = {
  container: DefaultContainer,
  heading: DefaultHeading,
  paragraph: DefaultParagraph,
  span: DefaultSpan,
  blockquote: DefaultBlockquote,
  code: DefaultCode,
  icon: DefaultIcon,
  image: DefaultImage,
  link: DefaultLink,
  input: DefaultInput,
  textarea: DefaultTextarea,
  select: DefaultSelect,
  radiogroup: DefaultRadioGroup,
  button: DefaultButton,
  submit: DefaultSubmit,
  reset: DefaultReset,
  form: DefaultForm,
  search: DefaultSearch,
  video: DefaultVideo,
  audio: DefaultAudio,
  youtube: DefaultYoutube,
  vimeo: DefaultVimeo,
  slider: DefaultSlider,
  table: DefaultTable,
}