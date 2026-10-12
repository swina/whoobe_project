// Props every default component derives from a descriptor: its attributes (including the Alpine directives), class and inline style.
// Kept apart from defaults.tsx so the Table component (table.tsx) can use them without importing the file that imports it.

import type { RenderDescriptor } from '@whoobe-cms/renderer'

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

// Attributes are stored the way HTML spells them; React wants camelCase props (and warns, or drops the value, otherwise).
const REACT_PROP: Record<string, string> = {
  for: 'htmlFor', class: 'className', tabindex: 'tabIndex', colspan: 'colSpan', rowspan: 'rowSpan', maxlength: 'maxLength',
  minlength: 'minLength', readonly: 'readOnly', autocomplete: 'autoComplete', autofocus: 'autoFocus', autoplay: 'autoPlay',
  playsinline: 'playsInline', crossorigin: 'crossOrigin', srcset: 'srcSet', enctype: 'encType', novalidate: 'noValidate',
  datetime: 'dateTime', frameborder: 'frameBorder', allowfullscreen: 'allowFullScreen', contenteditable: 'contentEditable',
  spellcheck: 'spellCheck', accesskey: 'accessKey', charset: 'charSet', usemap: 'useMap', formaction: 'formAction',
  inputmode: 'inputMode', hreflang: 'hrefLang', srclang: 'srcLang', cellpadding: 'cellPadding', cellspacing: 'cellSpacing',
}
// Boolean attributes: HTML writes `disabled` or `disabled=""`, React needs true/false (an empty string reads as false there).
const BOOLEAN_PROP = new Set([
  'disabled', 'checked', 'required', 'readOnly', 'multiple', 'hidden', 'autoPlay', 'controls', 'loop', 'muted', 'playsInline',
  'autoFocus', 'selected', 'open', 'noValidate', 'allowFullScreen', 'default', 'reversed',
])

export function baseProps(d: RenderDescriptor): Record<string, unknown> {
  const props: Record<string, unknown> = {}
  for (const [name, value] of Object.entries(d.attributes)) {
    const key = REACT_PROP[name.toLowerCase()] ?? name
    props[key] = BOOLEAN_PROP.has(key) && typeof value === 'string'
      ? !(value === 'false' || value === '0')
      : value
  }
  const own = typeof props.className === 'string' ? props.className : ''
  const className = [own, d.className].filter(Boolean).join(' ')
  if (className) props.className = className
  else delete props.className
  const attrStyle = typeof props.style === 'string' ? cssToReactStyle(props.style) : (props.style as Record<string, string> | undefined)
  if (d.style) props.style = { ...attrStyle, ...cssToReactStyle(d.style) }
  else if (attrStyle) props.style = attrStyle
  return props
}
