// Classes that hide an element in the published view but not in the editor canvas: the element stays visible and
// selectable there (a hidden element could never be edited again), with a badge saying how it is hidden.
//
// The check looks at the utility itself, after any variants: `hidden`, `lg:hidden`, `max-md:hidden`, `dark:hidden`,
// `group-hover:hidden`, `[&:hover]:hidden`, `!hidden`, `lg:hidden!` all hide something; `hidden` alone is only the
// simplest of them. Matching just the bare class left `md:hidden` / `lg:hidden` in force on the canvas (Tailwind runs
// there for real, so the element vanished and could not be selected, nor edited).

export const EDITOR_HIDDEN_CLASSES = new Set(['hidden', 'invisible', 'sr-only'])

/** The utility of a class: what follows the last `:` that is not inside `[...]`, without a leading or trailing `!`. */
export function utilityOf(token: string): string {
  let depth = 0
  let start = 0
  for (let i = 0; i < token.length; i++) {
    const c = token[i]
    if (c === '[' || c === '(') depth++
    else if (c === ']' || c === ')') depth = Math.max(0, depth - 1)
    else if (c === ':' && depth === 0) start = i + 1
  }
  return token.slice(start).replace(/^!/, '').replace(/!$/, '')
}

export function isEditorHiddenClass(token: string): boolean {
  return EDITOR_HIDDEN_CLASSES.has(utilityOf(token))
}

/** Strips the editor-hidden classes from a class string. `hidden` lists what was removed (`['lg:hidden']`). */
export function stripEditorHidden(cls: string): { cleaned: string; hasHidden: boolean; hidden: string[] } {
  const filtered: string[] = []
  const hidden: string[] = []
  for (const p of cls.split(/\s+/).filter(Boolean)) {
    if (isEditorHiddenClass(p)) hidden.push(p)
    else filtered.push(p)
  }
  return { cleaned: filtered.join(' '), hasHidden: hidden.length > 0, hidden }
}
