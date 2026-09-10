"use client"
// Built-in default components for every primitive node kind, so a page
// renders with an empty registry. Consumers override any kind via the
// registry to map it to their own design-system component.

import { useState, useEffect, createElement, type FormEvent, type ReactNode } from 'react'
import type { RenderDescriptor } from '@whoobe-cms/renderer'
import { useWhoobe } from './context.js'
import type { NodeComponent } from './types.js'

function cssToReactStyle(css: string): Record<string, string> {
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

/** Container (grid/flex/section/...): resolves the tag + class/style + children. */
export const DefaultContainer: NodeComponent = ({ descriptor, children }) => {
  const Tag = descriptor.tag as any
  return <Tag {...baseProps(descriptor)}>{children}</Tag>
}

/** Text nodes (heading/paragraph/span/blockquote/code): safe HTML. */
export function makeTextComponent(name: string): NodeComponent {
  const TextComponent: NodeComponent = ({ descriptor }) => {
    const Tag = descriptor.tag as any
    return (
      <Tag
        {...baseProps(descriptor)}
        dangerouslySetInnerHTML={descriptor.content ? { __html: descriptor.content } : undefined}
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

/** Lucide icon — dynamically imports lucide-react and renders the icon by name.
 *  Falls back to rendering the icon name as text when lucide-react is not installed
 *  or the icon name is unknown. */
export const DefaultIcon: NodeComponent = ({ descriptor }) => {
  const iconCache = useIconCache()
  const iconName = descriptor.content || 'HelpCircle'
  const IconComp = iconCache[iconName]
  const Tag = descriptor.tag as any
  const bp = baseProps(descriptor)

  if (IconComp) {
    return <Tag {...bp}>{createElement(IconComp as any)}</Tag>
  }

  // Try to load the icon dynamically
  return <LucideIconLoader name={iconName} tag={Tag} attributes={bp} />
}

function LucideIconLoader({ name, tag: Tag, attributes }: {
  name: string; tag: string; attributes: Record<string, unknown>
}) {
  const IconComp = useLucideIcon(name)
  if (IconComp) {
    return createElement(Tag as any, attributes, createElement(IconComp as any))
  }
  // Fallback: render icon name
  return createElement(Tag as any, attributes, name)
}

let lucideModule: any = null
let lucidePromise: Promise<any> | null = null
const iconCacheLocal: Record<string, any> = {}

function useIconCache() {
  useEffect(() => {
    loadLucide()
  }, [])
  return iconCacheLocal
}

function useLucideIcon(name: string): any {
  const [Icon, setIcon] = useState<any>(null)
  useEffect(() => {
    loadLucide().then(() => {
      const comp = resolveIconSync(name)
      if (comp) setIcon(() => comp)
    })
  }, [name])
  return Icon
}

async function loadLucide(): Promise<void> {
  if (lucideModule) return
  if (lucidePromise) return lucidePromise
  try {
    lucidePromise = import('lucide-react')
    lucideModule = await lucidePromise
    // Pre-populate cache with all icons
    for (const [key, val] of Object.entries(lucideModule)) {
      if (typeof val === 'function' || typeof val === 'object') {
        iconCacheLocal[key] = val
      }
    }
  } catch {
    lucideModule = {}
  }
  lucidePromise = null
}

function resolveIconSync(name: string): any {
  if (!lucideModule) return null
  const pascal = name
    .trim()
    .split(/[^a-zA-Z0-9]+|(?<=[a-z])(?=[A-Z])/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
    .join('')
  return lucideModule[pascal] ?? null
}

/** Image: resolved src/alt (DAM references already resolved by the renderer). */
export const DefaultImage: NodeComponent = ({ descriptor }) => {
  if (!descriptor.image) return null
  return <img src={descriptor.image.url} alt={descriptor.image.alt ?? ''} {...baseProps(descriptor)} />
}

/** Link: wraps children in the resolved href/target. */
export const DefaultLink: NodeComponent = ({ descriptor, children }) => {
  if (descriptor.link) {
    return (
      <a href={descriptor.link.href} target={descriptor.link.target} {...baseProps(descriptor)}>
        {children}
      </a>
    )
  }
  return <span {...baseProps(descriptor)}>{children}</span>
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
      <option key={o.value} value={o.value}>
        {o.label}
      </option>
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

/** Button: renders optionally with a Lucide icon from buttonIcon on the node. */
export const DefaultButton: NodeComponent = ({ descriptor }) => {
  const node = descriptor.node as Record<string, unknown> | undefined
  const buttonIcon = (node?.buttonIcon as string) ?? ''
  const iconWidth = (node?.buttonIconWidth as number) ?? 16
  const iconHeight = (node?.buttonIconHeight as number) ?? 16
  return (
    <button {...fieldProps(descriptor)} type="button">
      <ButtonIcon name={buttonIcon} width={iconWidth} height={iconHeight} />
      {descriptor.content}
    </button>
  )
}

function ButtonIcon({ name, width, height }: { name: string; width: number; height: number }) {
  const IconComp = useLucideIcon(name)
  if (!name || !IconComp) return null
  return <IconComp style={{ width, height, display: 'inline-block', verticalAlign: 'middle', marginRight: 4 }} />
}

export const DefaultSubmit: NodeComponent = ({ descriptor }) => {
  const node = descriptor.node as Record<string, unknown> | undefined
  const buttonIcon = (node?.buttonIcon as string) ?? ''
  const iconWidth = (node?.buttonIconWidth as number) ?? 16
  const iconHeight = (node?.buttonIconHeight as number) ?? 16
  return (
    <button {...fieldProps(descriptor)} type="submit">
      <ButtonIcon name={buttonIcon} width={iconWidth} height={iconHeight} />
      {descriptor.content || 'Submit'}
    </button>
  )
}

export const DefaultReset: NodeComponent = ({ descriptor }) => {
  const node = descriptor.node as Record<string, unknown> | undefined
  const buttonIcon = (node?.buttonIcon as string) ?? ''
  const iconWidth = (node?.buttonIconWidth as number) ?? 16
  const iconHeight = (node?.buttonIconHeight as number) ?? 16
  return (
    <button {...fieldProps(descriptor)} type="reset">
      <ButtonIcon name={buttonIcon} width={iconWidth} height={iconHeight} />
      {descriptor.content || 'Reset'}
    </button>
  )
}

/** Form: fields inside a <form>, submits to /public/forms/:classId/submit,
 *  injects the honeypot, resets on success and shows a click-to-close popup. */
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
      await ctx.api.submitForm(fc.targetClassId, attributes, { notify: fc.notify })
      formEl.reset()
      setResult({ ok: true, message: fc.successMessage || 'Submitted.' })
    } catch {
      setResult({ ok: false, message: fc.errorMessage || 'Something went wrong, please try again.' })
    }
  }

  return (
    <form {...baseProps(descriptor)} onSubmit={onSubmit}>
      <input
        name="_hp"
        type="text"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        style={{ position: 'absolute', left: -9999, width: 1, height: 1, overflow: 'hidden' }}
      />
      {children}
      {result && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 100000, background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, cursor: 'pointer' }}
          onClick={() => setResult(null)}
        >
          <div
            style={{ background: '#fff', borderRadius: 12, boxShadow: '0 20px 40px rgba(0,0,0,.2)', maxWidth: 448, width: '100%', padding: 24, fontSize: 14, color: result.ok ? '#047857' : '#be123c' }}
            dangerouslySetInnerHTML={{ __html: result.message }}
          />
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
          {results.map((r, i) => (
            <li key={i}>{String(r.title ?? r.name ?? r.id)}</li>
          ))}
        </ul>
      )}
    </form>
  )
}

// --- media (light built-ins; consumers usually map these) ---

export const DefaultVideo: NodeComponent = ({ descriptor }) => (
  <video {...fieldProps(descriptor)} src={descriptor.node.src ?? undefined} controls />
)

export const DefaultYoutube: NodeComponent = ({ descriptor }) => (
  <div {...baseProps(descriptor)} data-embed="youtube">
    {descriptor.content || 'YouTube'}
  </div>
)

export const DefaultVimeo: NodeComponent = ({ descriptor }) => (
  <div {...baseProps(descriptor)} data-embed="vimeo">
    {descriptor.content || 'Vimeo'}
  </div>
)

export const DefaultSlider: NodeComponent = ({ descriptor, children }) => (
  <div {...baseProps(descriptor)} data-slider="true">
    {children}
  </div>
)

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
  youtube: DefaultYoutube,
  vimeo: DefaultVimeo,
  slider: DefaultSlider,
}
