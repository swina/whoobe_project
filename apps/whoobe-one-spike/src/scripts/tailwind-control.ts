// Shared logic behind whoobe-one-studio's src/components/blocks/tailwind/
// controls/*.vue (tailwind.options.vue, tailwind.range.vue,
// tailwind.checkbox.vue, tailwind.width.vue, tailwind.height.vue) - every
// one of those files does the same two things with slightly different UI:
// scan the selected node's current Tailwind class string for whichever
// option (from tw.classes.js's per-attribute list) is already present, and
// replace it with a newly-picked one. Consolidated here into two functions
// instead of five near-duplicate per-file scan/replace implementations -
// still the same real behavior, not a UI simplification, a code-dedup one.
//
// tailwind.width.vue/tailwind.height.vue turned out to be functionally
// identical to tailwind.options.vue (same scan-and-replace logic, just a
// `{label, value}` shape instead of plain strings) - `labelFor()` below
// handles both shapes, so OptionsControl.vue covers all three; no separate
// Width/Height control components exist in this port.
import classes from './tw.classes.js'
import { clean } from '../helpers'
import type { useEditorStore } from '../store/editor'

type EditorStore = ReturnType<typeof useEditorStore>
type Option = string | { label: string; value: string }

export function rawOptionsFor(attr: string): Option[] {
  return (classes as Record<string, Option[]>)[attr] ?? []
}

export function optionsFor(attr: string): string[] {
  return rawOptionsFor(attr).map((opt) => (typeof opt === 'string' ? opt : opt.value))
}

/** Explicit label if tw.classes.js provides one (Width/Height's {label,
 * value} shape); otherwise auto-generated from the class name itself -
 * port of tailwind.options.vue's own `option()` method (strip the
 * "family" prefix, e.g. "justify-content-between" -> "Content Between"
 * isn't quite right either - the source's version strips only the first
 * segment: "justify-between" -> "Between"). */
export function labelFor(attr: string, value: string): string {
  const raw = rawOptionsFor(attr).find((opt) => (typeof opt === 'string' ? opt : opt.value) === value)
  if (raw && typeof raw === 'object') return raw.label
  if (value.startsWith('-')) {
    const parts = value.split('-')
    return '-' + parts[parts.length - 1]
  }
  const parts = value.split('-')
  parts.shift()
  return parts.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') || value
}

export function currentValueFor(editor: EditorStore, attr: string): string {
  if (!editor.current) return ''
  const options = optionsFor(attr)
  return editor.current.css.css.split(' ').find((cl) => options.includes(cl)) ?? ''
}

/** Removes whichever option for this attr is currently present (if any)
 * and appends the new one - the exclusive-choice pattern every Options/
 * Range/Checkbox/Width/Height control shares (only one value for a given
 * concern, e.g. one `w-*` class, should ever be active at once). */
export function applyValue(editor: EditorStore, attr: string, value: string): void {
  if (!editor.current) return
  const options = optionsFor(attr)
  const withoutOld = editor.current.css.css
    .split(' ')
    .filter((cl) => !options.includes(cl))
    .join(' ')
  editor.current.css.css = clean(`${withoutOld} ${value}`)
}

export function hasClass(editor: EditorStore, className: string): boolean {
  return !!editor.current?.css.css.split(' ').includes(className)
}

/** Port of tailwind.button.vue's logic - a single named class toggled on/
 * off directly (not a pick-one-of-many list, unlike the controls above). */
export function toggleClass(editor: EditorStore, className: string): void {
  if (!editor.current) return
  const has = hasClass(editor, className)
  const without = editor.current.css.css
    .split(' ')
    .filter((cl) => cl !== className)
    .join(' ')
  editor.current.css.css = clean(has ? without : `${without} ${className}`)
}
