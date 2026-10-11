// The Automations panel lists the forms that start an automation, found in the page and snippet trees
// (docs/plans/automations/automations-panel.md).
import { describe, it, expect } from 'vitest'
import { collectAutomations, filterAutomations, automationEditorUrl, type AutomationSource } from '../../../packages/sdk/schema/src/automations'

const page: AutomationSource = { kind: 'page', id: 'p1', title: 'Landing', websiteId: 'w1', published: true }
const snippet: AutomationSource = { kind: 'snippet', id: 's1', title: 'Signup box' }
const form = (id: string, fc: object, extra: object = {}) => ({ id, blocks: [], formConfig: { enabled: true, ...fc }, ...extra })

describe('automations registry: collectAutomations', () => {
  it('finds gateway and database forms at any depth, in document order', () => {
    const tree = { id: 'root', blocks: [
      { id: 'a', blocks: [form('f1', { gatewayEndpointName: 'Activepieces', gatewayRoutePath: '/api/v1/webhooks/x' })] },
      form('f2', { targetClassId: 'c1' }),
    ] }
    const r = collectAutomations(tree, page)
    expect(r.map((e) => [e.elementId, e.target, e.endpoint, e.route])).toEqual([
      ['f1', 'gateway', 'Activepieces', '/api/v1/webhooks/x'],
      ['f2', 'database', '', ''],
    ])
    expect(r[0].key).toBe('page:p1:f1')
  })
  it('ignores a form with submission handling off, a node without id, and junk input', () => {
    expect(collectAutomations({ id: 'r', blocks: [form('f', { enabled: false, gatewayEndpointName: 'x' }), { blocks: [], formConfig: { enabled: true } }] }, page)).toEqual([])
    for (const junk of [null, undefined, 'x', 7, [], { blocks: 'nope' }]) expect(collectAutomations(junk, page)).toEqual([])
  })
  it('uses the form name, else the page or snippet title', () => {
    const r = collectAutomations({ id: 'r', blocks: [form('a', { name: '  Newsletter ' }), form('b', {})] }, snippet)
    expect(r.map((e) => e.name)).toEqual(['Newsletter', 'Signup box'])
  })
  it('knows when the page reacts to the result: a listener on the form or on an ancestor, not on a sibling or descendant', () => {
    const tree = { id: 'r', blocks: [
      { id: 'wrap', alpine: { 'x-data': '{}', '@whoobe-form-result': 'done = true' }, blocks: [form('in', {})] },
      { id: 'wrap2', alpine: { 'x-on:whoobe-form-result.window': 'x' }, blocks: [form('in2', {})] },
      form('own', {}, { alpine: { '@whoobe-form-result': 'y' } }),
      { id: 'sib', alpine: { '@whoobe-form-result': 'z' }, blocks: [] },
      form('none', {}),
      form('below', {}, { blocks: [{ id: 'kid', alpine: { '@whoobe-form-result': 'k' }, blocks: [] }] }),
    ] }
    const r = Object.fromEntries(collectAutomations(tree, page).map((e) => [e.elementId, e.reactsToResult]))
    expect(r).toEqual({ in: true, in2: true, own: true, none: false, below: false })
  })
  it('reports the popup as off only when showResultMessage is false', () => {
    const r = collectAutomations({ id: 'r', blocks: [form('a', { showResultMessage: false }), form('b', {}), form('c', { showResultMessage: true })] }, page)
    expect(r.map((e) => e.popupOff)).toEqual([true, false, false])
  })
  it('survives a very deep or cyclic-looking tree without hanging', () => {
    let node: any = form('leaf', {})
    for (let i = 0; i < 500; i++) node = { id: `n${i}`, blocks: [node] }
    expect(collectAutomations(node, page)).toEqual([])   // deeper than the guard: skipped, not a stack overflow
  })
})

describe('automations registry: filter and url', () => {
  const entries = collectAutomations({ id: 'r', blocks: [
    form('a', { name: 'Newsletter', gatewayEndpointName: 'Brevo', gatewayRoutePath: '/contacts' }),
    form('b', { gatewayEndpointName: 'Activepieces', gatewayRoutePath: '/hook' }),
    form('c', { targetClassId: 'k' }),
  ] }, page)
  it('filters by text, endpoint and target', () => {
    expect(filterAutomations(entries, {}).length).toBe(3)
    expect(filterAutomations(entries, { gatewayOnly: true }).map((e) => e.elementId)).toEqual(['a', 'b'])
    expect(filterAutomations(entries, { endpoint: 'Brevo' }).map((e) => e.elementId)).toEqual(['a'])
    expect(filterAutomations(entries, { text: 'NEWS' }).map((e) => e.elementId)).toEqual(['a'])
    expect(filterAutomations(entries, { text: '/hook' }).map((e) => e.elementId)).toEqual(['b'])
    expect(filterAutomations(entries, { text: 'zzz' })).toEqual([])
  })
  it('builds the editor url for a page and a snippet, encoding the ids', () => {
    expect(automationEditorUrl(entries[0])).toBe('/editor?pageId=p1&elementId=a')
    const s = collectAutomations(form('e&1', {}), snippet)[0]
    expect(automationEditorUrl(s)).toBe('/editor?snippetId=s1&elementId=e%261')
  })
})
