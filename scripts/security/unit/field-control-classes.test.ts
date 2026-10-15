// The classes of the object edit form's controls: built-in per type, the class's own "Input styles", and the field's custom classes
// merged over them (a plain `py-1` next to the built-in `py-2` used to lose: Tailwind gives no priority to the later class).
import { describe, it, expect } from 'vitest'
import { DEFAULT_INPUT_CLASSES, resolveControlLayout } from '../../../apps/admin-dashboard/src/utils/field-control-classes'
import { splitPlacementClasses } from '../../../apps/admin-dashboard/src/utils/custom-classes'

const tokens = (c: string) => c.split(/\s+/).filter(Boolean)

describe('resolveControlLayout', () => {
  it('uses the built-in classes of the type when nothing else is set', () => {
    expect(tokens(resolveControlLayout('text', null, undefined).class).sort()).toEqual(tokens(DEFAULT_INPUT_CLASSES.text).sort())
    expect(resolveControlLayout('select', undefined, '').class).toContain('text-slate-300')
  })

  it("lets a field's own py-1 replace the built-in py-2 (and keep the rest)", () => {
    const t = tokens(resolveControlLayout('text', null, 'py-1').class)
    expect(t).toContain('py-1')
    expect(t).not.toContain('py-2')
    expect(t).toContain('px-3')
    expect(t).toContain('rounded-lg')
  })

  it('merges over variants separately: a light: colour does not remove the dark one', () => {
    const t = tokens(resolveControlLayout('text', null, 'light:bg-white').class)
    expect(t).toContain('light:bg-white')
    expect(t).not.toContain('light:bg-slate-50')
    expect(t).toContain('bg-slate-950')
  })

  it("the class's string for a type replaces the built-in one, the field's classes still win over it", () => {
    const cfg = { text: 'w-full px-2 py-4 text-xs border rounded' }
    const t = tokens(resolveControlLayout('text', cfg, 'py-1').class)
    expect(t).toContain('py-1')
    expect(t).not.toContain('py-4')
    expect(t).not.toContain('bg-slate-950') // the configured string replaced the built-in classes
    expect(tokens(resolveControlLayout('select', cfg, '').class)).toContain('text-slate-300') // other types keep theirs
  })

  it('an empty configured string means the built-in classes', () => {
    expect(resolveControlLayout('text', { text: '   ' }, undefined).class).toContain('bg-slate-950')
  })

  it('arbitrary values become inline style, which beats any class', () => {
    const r = resolveControlLayout('text', null, 'py-[3px] bg-[#ff0000]')
    expect(r.style).toMatchObject({ paddingBlock: '3px', backgroundColor: '#ff0000' })
  })
})

describe('splitPlacementClasses', () => {
  it('sends grid placement to the wrapper and the rest to the control', () => {
    expect(splitPlacementClasses('col-span-2 py-1 md:col-start-2 self-end bg-red-50')).toEqual({
      placement: 'col-span-2 md:col-start-2 self-end',
      rest: 'py-1 bg-red-50',
    })
    expect(splitPlacementClasses(undefined)).toEqual({ placement: '', rest: '' })
    expect(splitPlacementClasses('order-last row-span-3').rest).toBe('')
  })
})
