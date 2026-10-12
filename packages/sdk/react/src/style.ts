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

export function baseProps(d: RenderDescriptor): Record<string, unknown> {
  const props: Record<string, unknown> = { ...d.attributes }
  if (d.className) props.className = d.className
  if (d.style) props.style = cssToReactStyle(d.style)
  return props
}
