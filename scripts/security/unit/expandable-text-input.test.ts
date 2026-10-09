// The expandable text field (Slider settings: tab button classes ...) opens a popup teleported to <body>, where the page's light
// text colour is inherited: the input and the popup's textarea must set their own dark text on white (they were light grey on
// white and unreadable).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT_DIR } from '../lib/config'

const src = readFileSync(join(ROOT_DIR, 'apps/whoobe-one-spike/src/components/ExpandableTextInput.vue'), 'utf8')
const classOf = (tag: string) => new RegExp(`<${tag}[\\s\\S]*?class="([^"]*)"`).exec(src)?.[1] ?? ''

describe('ExpandableTextInput colours', () => {
  it.each(['input', 'textarea'])('the %s sets a dark text colour on a white background', (tag) => {
    const c = classOf(tag)
    expect(c, tag).toMatch(/\btext-gray-900\b/)
    expect(c, tag).toMatch(/\bbg-white\b/)
  })
  it('the popup panel also sets its text colour (its title and buttons do not inherit the page colour)', () => {
    expect(src).toMatch(/class="bg-white text-gray-900 rounded-lg/)
  })
})
