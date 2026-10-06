"use client"
// Built-in default components for every primitive node kind, so a page
// renders with an empty registry. Consumers override any kind via the
// registry to map it to their own design-system component.

import { useState, useEffect, useRef, useCallback, createElement, type FormEvent, type ReactNode } from 'react'
import { sanitizeRichText } from '@whoobe-cms/schema'
import * as LucideIcons from 'lucide-react'
import type { RenderDescriptor } from '@whoobe-cms/renderer'
import { useWhoobe } from './context.js'
import type { NodeComponent } from './types.js'

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

export function cssToReactStyle(css: string): Record<string, string> {
  const obj: Record<string, string> = {}
  for (const decl of css.split(';')) {
    const colon = decl.indexOf(':')
    if (colon === -1) continue
    const prop = decl.slice(0, colon).trim()
    const val = decl.slice(colon + 1).trim()
    if (!prop || !val) continue
    const camel = prop.replace(/-([a-z])/g, (_, c) => c.toUpperCase())
    obj[camel] = val.replace(/^['"]|['"]$/g, '')
  }
  return obj
}

function baseProps(d: RenderDescriptor): Record<string, unknown> {
  const props: Record<string, unknown> = { ...d.attributes }
  if (d.className) props.className = d.className
  if (d.style) props.style = cssToReactStyle(d.style)
  return props
}

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

/** Mounts GSAP animation on an element ref. */
function useGsapAnimation(descriptor: RenderDescriptor, ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const gsapConfig = (descriptor.node as any)?.gsap
    const el = ref.current
    if (!gsapConfig?.animation || !el) return
    let killed = false

    const run = async () => {
      try {
        // @ts-expect-error - gsap is optional, loaded dynamically at runtime
        const gsapModule = await import('gsap')
        // @ts-expect-error - gsap/ScrollTrigger is optional, loaded dynamically
        const stModule = await import('gsap/ScrollTrigger')
        if (killed || !ref.current) return
        const gsap = gsapModule.default
        gsap.registerPlugin(stModule.ScrollTrigger)
        const effect = (gsap as any).effects?.[gsapConfig.animation]
        if (!effect) return

        const opts = {
          duration: parseFloat(String(gsapConfig.duration)) || undefined,
          delay: parseFloat(String(gsapConfig.delay)) || undefined,
          ease: gsapConfig.ease || undefined,
        }

        if (!gsapConfig.trigger) {
          const animation = effect(ref.current, opts)
          const trigger = stModule.ScrollTrigger.create({
            start: 'top 99.99%',
            trigger: ref.current,
            toggleActions: 'play pause restart none',
            animation,
            onEnter: () => {
              if (gsapConfig.delay) animation.play()
              else animation.play(0)
            },
          })
          return () => { trigger.kill(); killed = true }
        } else {
          let hoverAnim: any = null
          const node = ref.current
          if (!node) return
          const onEnter = () => { hoverAnim = effect(node, opts); hoverAnim?.play() }
          const onLeave = () => { hoverAnim?.reverse() }
          node.addEventListener('mouseenter', onEnter)
          node.addEventListener('mouseleave', onLeave)
          return () => {
            node.removeEventListener('mouseenter', onEnter)
            node.removeEventListener('mouseleave', onLeave)
            hoverAnim?.kill()
            killed = true
          }
        }
      } catch { /* GSAP not available */ }
    }

    const cleanupPromise = run()
    return () => { killed = true; cleanupPromise.then((fn) => fn?.()) }
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
  if (descriptor.link) {
    return <a href={descriptor.link.href} target={descriptor.link.target} {...bp}>{children}</a>
  }
  return <span {...bp}>{children}</span>
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
    return <a href={descriptor.link.href} target={descriptor.link.target} {...bp} className={(bp.className as string) + ' inline-flex items-center'}>{inner}</a>
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

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fc = descriptor.formConfig
    if (!fc) return
    const formEl = e.currentTarget
    const attributes = Object.fromEntries(new FormData(formEl).entries())
    try {
      await ctx.api.submitForm(fc.targetClassId, attributes, {
        notify: fc.notify,
        gatewayBindingId: fc.gatewayBindingId,
      })
      formEl.reset()
      setResult({ ok: true, message: fc.successMessage || 'Submitted.' })
    } catch {
      setResult({ ok: false, message: fc.errorMessage || 'Something went wrong, please try again.' })
    }
  }

  return (
    <form {...baseProps(descriptor)} onSubmit={onSubmit}>
      <input name="_hp" type="text" tabIndex={-1} autoComplete="off" aria-hidden="true"
        style={{ position: 'absolute', left: -9999, width: 1, height: 1, overflow: 'hidden' }} />
      {children}
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
  <video {...fieldProps(descriptor)} src={descriptor.node.src ?? undefined} controls />
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

const DEFAULT_SLIDER_SETTINGS = {
  autoplay: false,
  interval: 5000,
  loop: true,
  showNav: true,
  showDots: true,
  mode: 'standard',
  navClass: 'flex items-center justify-center gap-1.5 px-2 py-1',
  arrowClass: 'w-8 h-8 p-2 rounded-full bg-black/40 hover:bg-black/60 text-white',
  dotClass: 'w-2.5 h-2.5 rounded-full bg-gray-300 hover:bg-gray-400 transition-colors',
  activeDotClass: 'w-2.5 h-2.5 rounded-full bg-indigo-600 transition-colors',
  dotContainerClass: 'flex items-center justify-center gap-2 pt-3',
}

export const DefaultSlider: NodeComponent = ({ descriptor }) => {
  const ctx = useWhoobe()
  const slides = descriptor.children ?? []
  const s = { ...DEFAULT_SLIDER_SETTINGS, ...(descriptor.slider ?? {}) } as any
  const [current, setCurrent] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const total = slides.length

  const goTo = useCallback((i: number) => {
    if (s.loop) setCurrent(((i % total) + total) % total)
    else setCurrent(Math.max(0, Math.min(i, total - 1)))
  }, [total, s.loop])

  const next = useCallback(() => goTo(current + 1), [current, goTo])
  const prev = useCallback(() => goTo(current - 1), [current, goTo])

  useEffect(() => {
    if (!s.autoplay || total <= 1) return
    timerRef.current = setInterval(next, s.interval)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [s.autoplay, s.interval, next, total])

  // Deep-link support: a URL like `/features#slide2` (or `#slide-2`/
  // `#slide_2`, 1-based) jumps this slider straight to that slide on load -
  // the same `#slideN` convention already documented as an in-page anchor
  // example (see packages/mobile-app's generated App.vue) extended to
  // actually switch the active slide, not just scroll to it. Run in an
  // effect (not a useState initializer) so server-rendered/statically
  // exported markup always starts at slide 0 and only the client applies
  // the hash, avoiding a hydration mismatch. Re-applied on `hashchange`
  // too, so an in-page link to `#slide3` clicked while already on this page
  // also works. If a page has more than one slider, every one of them
  // reacts to the same hash - there's no per-slider id in the hash to
  // disambiguate.
  useEffect(() => {
    if (typeof window === 'undefined' || total === 0) return
    const applyHashSlide = () => {
      const match = /^#?slide[-_]?(\d+)$/i.exec(window.location.hash)
      if (!match) return
      const requested = parseInt(match[1], 10) - 1
      setCurrent(Math.max(0, Math.min(requested, total - 1)))
    }
    applyHashSlide()
    window.addEventListener('hashchange', applyHashSlide)
    return () => window.removeEventListener('hashchange', applyHashSlide)
  }, [total])

  if (total === 0) return <div {...baseProps(descriptor)} />

  return (
    <div {...baseProps(descriptor)}>
      {/* Sliding track */}
      <div style={{ overflow: 'hidden', position: 'relative' }}>
        <div style={{ display: 'flex', transition: 'transform 0.5s ease', transform: `translateX(-${current * 100}%)` }}>
          {slides.map((child, i) => {
          const SlideComp = (ctx.registry[child.kind] ?? DefaultContainer) as NodeComponent
          return (
            <div key={child.id} style={{ minWidth: '100%', boxSizing: 'border-box' }}>
              <SlideComp descriptor={child} />
            </div>
          )
        })}
        </div>
      </div>

      {/* Tab navigation (mode: tabs) */}
      {s.mode === 'tabs' && s.tabsPosition === 'above' && (
        <div className={s.tabContainerClass || 'flex items-center justify-center gap-2'}>
          {slides.map((_, i) => (
            <button key={i} onClick={() => goTo(i)}
              className={i === current ? s.activeTabClass : s.tabClass}>{/* label */}</button>
          ))}
        </div>
      )}

      {/* Arrow navigation (mode: standard) */}
      {s.showNav && total > 1 && (
        <div className={s.navClass} style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 8 }}>
          <button onClick={prev} className={s.arrowClass} aria-label="Previous">‹</button>
          <button onClick={next} className={s.arrowClass} aria-label="Next">›</button>
        </div>
      )}

      {/* Dot navigation */}
      {s.showDots && total > 1 && (
        <div className={s.dotContainerClass}>
          {slides.map((_, i) => (
            <button key={i} onClick={() => goTo(i)}
              className={i === current ? s.activeDotClass : s.dotClass} aria-label={`Slide ${i + 1}`} />
          ))}
        </div>
      )}

      {/* Tab navigation (mode: tabs, below) */}
      {s.mode === 'tabs' && s.tabsPosition === 'below' && (
        <div className={s.tabContainerClass || 'flex items-center justify-center gap-2'}>
          {slides.map((_, i) => (
            <button key={i} onClick={() => goTo(i)}
              className={i === current ? s.activeTabClass : s.tabClass}>{/* label */}</button>
          ))}
        </div>
      )}
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
}