// Every Tailwind class an authored tree can ask for, and the classes the built-in components of the adapters use when the author sets none.
// The generators (packages/publish) build the CSS safelist from these: a class that is not listed here is not in the CSS of a generated
// site. Classes are kept in more places than `css.css` / `css.container`: the sections and columns of a table, the pagination of a
// binding, a slider's navigation, a search box. The test next to this file fails when a field ending in `Class` is added to the node types
// without being listed.

import { TABLE_DEFAULT_CLASSES } from './table-binding.js'

/** The classes the default slider components of the React and Vue adapters use when the author sets none: the defaults of
 *  packages/sdk/renderer/src/slider.ts (the same ones the editor's preview uses). */
export const SLIDER_DEFAULT_CLASSES: readonly string[] = [
  'flex items-center justify-center gap-1.5 flex-wrap px-2 py-2',
  'w-8 h-8 p-2 rounded-full bg-black/40 hover:bg-black/60 text-white',
  'w-7 h-7 p-1.5 rounded-full bg-black/40 hover:bg-black/60 text-white',
  'px-2.5 py-1 rounded-full text-xs font-medium truncate max-w-[9rem] transition-colors border bg-white text-gray-600 border-gray-300 hover:border-indigo-400',
  'px-2.5 py-1 rounded-full text-xs font-medium truncate max-w-[9rem] transition-colors border bg-indigo-600 text-white border-indigo-600',
  'w-2.5 h-2.5 rounded-full bg-gray-300 hover:bg-gray-400 transition-colors',
  'w-2.5 h-2.5 rounded-full bg-indigo-600 transition-colors',
  'flex items-center justify-center gap-2 pt-3',
]

/** Name of every property that holds a class string, by the object it sits in. `cells` / `columns` / `rows` are lists of objects. */
export const CLASS_FIELDS = {
  css: ['css', 'container'],
  table: ['headerRowClass', 'bodyRowClass', 'footerRowClass', 'headerCellClass', 'bodyCellClass', 'footerCellClass'],
  tableCell: ['cellClass'],
  tableColumn: ['cellClass', 'headerCellClass'],
  tableOptions: ['searchClass', 'countClass'],
  binding: ['loadMoreClass', 'paginationContainerClass'],
  slider: ['navClass', 'arrowClass', 'homeClass', 'tabClass', 'activeTabClass', 'tabContainerClass', 'dotClass', 'activeDotClass', 'dotContainerClass'],
  searchConfig: ['dropdownClass', 'inputClass', 'buttonClass'],
} as const

/** Every distinct `*Class` property name above, plus the two of `css`: what the node types are checked against. */
export const ALL_CLASS_FIELD_NAMES: readonly string[] = [
  ...new Set(Object.entries(CLASS_FIELDS).flatMap(([group, names]) => (group === 'css' ? [] : names))),
]

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

function addClasses(value: unknown, into: Set<string>): void {
  if (typeof value !== 'string') return
  for (const cls of value.split(/\s+/)) if (cls) into.add(cls)
}

function addFields(obj: unknown, names: readonly string[], into: Set<string>): void {
  if (!isObject(obj)) return
  for (const name of names) addClasses(obj[name], into)
}

function addTransformClasses(transform: unknown, into: Set<string>): void {
  if (!isObject(transform) || transform.type !== 'valueMap' || !isObject(transform.options)) return
  const o = transform.options
  addClasses(o.fallbackClassName, into)
  if (Array.isArray(o.rules)) for (const r of o.rules) addFields(r, ['className'], into)
}

/** Adds to `into` every class an authored tree (a page, a snippet) can need: those of the node, its table, slider, search and
 *  bindings, and the default classes of the built-in components that node uses. Recurses into `blocks`. */
export function collectTreeClasses(node: unknown, into: Set<string>, depth = 0): void {
  if (!isObject(node) || depth > 200) return
  addFields(node.css, CLASS_FIELDS.css, into)
  addFields(node.slider, CLASS_FIELDS.slider, into)
  addFields(node.searchConfig, CLASS_FIELDS.searchConfig, into)
  addFields(node.dataBinding, CLASS_FIELDS.binding, into)
  addFields(node.gatewayBinding, CLASS_FIELDS.binding, into)

  const table = node.table
  if (isObject(table)) {
    addFields(table, CLASS_FIELDS.table, into)
    addFields(table, CLASS_FIELDS.tableOptions, into)
    for (const section of [table.header, table.footer]) {
      if (Array.isArray(section)) for (const cell of section) addFields(cell, CLASS_FIELDS.tableCell, into)
    }
    if (Array.isArray(table.body)) {
      for (const row of table.body) if (Array.isArray(row)) for (const cell of row) addFields(cell, CLASS_FIELDS.tableCell, into)
    }
    if (Array.isArray(table.columns)) for (const col of table.columns) addFields(col, CLASS_FIELDS.tableColumn, into)
  }

  // a "map value to label/class" transform carries Tailwind classes of its own (a badge per value), on a field binding or a table column
  addTransformClasses(isObject(node.dataBinding) ? node.dataBinding.transform : null, into)
  addTransformClasses(isObject(node.gatewayBinding) ? node.gatewayBinding.transform : null, into)
  if (isObject(table) && Array.isArray(table.columns)) for (const col of table.columns) addTransformClasses(isObject(col) ? col.transform : null, into)

  // what the built-in components bring with them when the author set nothing
  if (node.tag === 'slider') for (const c of SLIDER_DEFAULT_CLASSES) addClasses(c, into)
  if (node.tag === 'table') for (const c of TABLE_DEFAULT_CLASSES) addClasses(c, into)

  if (Array.isArray(node.blocks)) for (const child of node.blocks) collectTreeClasses(child, into, depth + 1)
}
