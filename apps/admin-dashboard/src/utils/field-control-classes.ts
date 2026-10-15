import { twMerge } from 'tailwind-merge'
import { resolveCustomClasses } from './custom-classes'

// The look of the form controls of a data object (DataObjectFieldControl.vue) is set in three layers, the last one wins:
//   1. the built-in class string of the control type (DEFAULT_INPUT_CLASSES);
//   2. the class's own string for that type (Class > View Layout > Input styles, viewConfig.inputClasses). It REPLACES the built-in
//      one: the editor shows the built-in string, ready to be edited;
//   3. the custom classes of the single field (Class > Fields > the field, field.className), merged OVER the result.
// Layer 3 is merged with tailwind-merge, not just appended: Tailwind does not give the later class in an attribute priority (the one
// generated later in the stylesheet wins), so a plain `py-1` next to the built-in `py-2` used to lose.

export const mergeClasses = (...classes: string[]): string => twMerge(...classes)

export type InputKind = 'text' | 'textarea' | 'select' | 'checkbox'

const BOX = 'w-full px-3 py-2 text-sm bg-slate-950 light:bg-slate-50 border border-slate-800 light:border-slate-400 rounded-lg focus:outline-none focus:border-indigo-500'

export const DEFAULT_INPUT_CLASSES: Record<InputKind, string> = {
  text: `${BOX} text-slate-200 light:text-slate-800`,
  textarea: `${BOX} text-slate-200 light:text-slate-800`,
  select: `${BOX} text-slate-300 light:text-slate-700`,
  checkbox: 'w-4 h-4 rounded border-slate-700 light:border-slate-300 bg-slate-950 light:bg-slate-50 text-indigo-600',
}

export const INPUT_KINDS: { kind: InputKind; label: string; applies: string }[] = [
  { kind: 'text', label: 'Text', applies: 'Input, e-mail, number, date, URL slug, array (tags), link, multiselect' },
  { kind: 'textarea', label: 'Textarea', applies: 'Textarea and JSON' },
  { kind: 'select', label: 'Select', applies: 'Select, relation selects and the "+ Add block" selector' },
  { kind: 'checkbox', label: 'Checkbox', applies: 'Checkbox' },
]

export type InputClassesConfig = Partial<Record<InputKind, string>> | null | undefined

export function resolveControlLayout(kind: InputKind, classConfig: InputClassesConfig, fieldClasses: string | undefined): { class: string; style: Record<string, string> } {
  const configured = classConfig?.[kind]?.trim()
  const base = resolveCustomClasses(configured ? configured : DEFAULT_INPUT_CLASSES[kind])
  const own = resolveCustomClasses(fieldClasses)
  return { class: twMerge(base.class, own.class), style: { ...base.style, ...own.style } }
}
