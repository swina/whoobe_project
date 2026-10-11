// Finds the forms that start an automation in a page or snippet tree, so the Automations panel can list them in one place
// (docs/plans/automations/automations-panel.md). Pure functions, no Vue and no network: the panel feeds them the trees.
// An "automation" here is a form with its submission handling on; Whoobe does not run flows (docs/plans/automations/
// why-no-custom-automation-engine.md), it records where a form is connected and whether the page reacts to the answer.

export interface RegistryNode {
  id?: string
  name?: string | null
  tag?: string | null
  blocks?: RegistryNode[]
  alpine?: Record<string, unknown>
  formConfig?: {
    enabled?: boolean
    name?: string
    gatewayEndpointName?: string
    gatewayRoutePath?: string
    gatewayBindingId?: string
    targetClassId?: string
    showResultMessage?: boolean
  }
}

export interface AutomationSource {
  kind: 'page' | 'snippet'
  id: string
  title: string
  websiteId?: string | null
  published?: boolean
}

export interface AutomationEntry {
  /** page / snippet id + element id: unique and stable while the form stays in place. */
  key: string
  source: AutomationSource
  elementId: string
  /** The name the editor gave the form, else the page / snippet title. */
  name: string
  target: 'gateway' | 'database'
  endpoint: string
  route: string
  /** An ancestor (or the form) listens for `whoobe-form-result`, so the page reacts to the answer. */
  reactsToResult: boolean
  /** The built-in success / error popup is off. */
  popupOff: boolean
}

const RESULT_LISTENER = /^(@|x-on:)whoobe-form-result(\.|$)/

function listensToResult(node: RegistryNode): boolean {
  const alpine = node.alpine
  if (!alpine || typeof alpine !== 'object') return false
  return Object.keys(alpine).some((k) => RESULT_LISTENER.test(k))
}

/** Every enabled form below `root` (the root itself included). `ancestorListens` carries "an ancestor already listens". */
export function collectAutomations(root: unknown, source: AutomationSource): AutomationEntry[] {
  const out: AutomationEntry[] = []
  const visit = (node: RegistryNode | null | undefined, ancestorListens: boolean, depth: number): void => {
    if (!node || typeof node !== 'object' || depth > 200) return
    const listens = ancestorListens || listensToResult(node)
    const fc = node.formConfig
    if (fc && fc.enabled && typeof node.id === 'string') {
      const gateway = typeof fc.gatewayEndpointName === 'string' && fc.gatewayEndpointName !== ''
      out.push({
        key: `${source.kind}:${source.id}:${node.id}`,
        source,
        elementId: node.id,
        name: (fc.name ?? '').trim() || source.title,
        target: gateway ? 'gateway' : 'database',
        endpoint: gateway ? fc.gatewayEndpointName! : '',
        route: gateway ? fc.gatewayRoutePath || '' : '',
        reactsToResult: listens,
        popupOff: fc.showResultMessage === false,
      })
    }
    for (const child of Array.isArray(node.blocks) ? node.blocks : []) visit(child, listens, depth + 1)
  }
  visit(root as RegistryNode, false, 0)
  return out
}

export interface AutomationFilter {
  text?: string
  endpoint?: string
  gatewayOnly?: boolean
}

export function filterAutomations(entries: AutomationEntry[], f: AutomationFilter): AutomationEntry[] {
  const q = (f.text ?? '').trim().toLowerCase()
  return entries.filter((e) => {
    if (f.gatewayOnly && e.target !== 'gateway') return false
    if (f.endpoint && e.endpoint !== f.endpoint) return false
    if (!q) return true
    return [e.name, e.source.title, e.endpoint, e.route].some((v) => v.toLowerCase().includes(q))
  })
}

/** Where the editor opens an entry: a new tab keeps the work in the current one; `elementId` selects the form. */
export function automationEditorUrl(e: AutomationEntry): string {
  const param = e.source.kind === 'page' ? 'pageId' : 'snippetId'
  return `/editor?${param}=${encodeURIComponent(e.source.id)}&elementId=${encodeURIComponent(e.elementId)}`
}
