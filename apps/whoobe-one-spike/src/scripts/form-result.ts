// Editor-side copy of packages/sdk/renderer/src/form-result.ts (the editor does not depend on the renderer package): what a form
// tells the page when a submission ends. Keep the two in step; unit/form-result-event.test.ts compares them.
// See docs/plans/automations/form-result-event.md.

export const FORM_RESULT_EVENT = 'whoobe-form-result'

export interface FormResultDetail {
  ok: boolean
  outcome: string | null
}

const OUTCOME_KEY = /^[A-Za-z0-9_-]{1,32}$/

export function sanitizeOutcome(value: unknown): string | null {
  return typeof value === 'string' && OUTCOME_KEY.test(value) ? value : null
}

export function showsResultMessage(formConfig: { showResultMessage?: boolean } | null | undefined): boolean {
  return formConfig?.showResultMessage !== false
}

export function dispatchFormResult(target: { dispatchEvent(event: Event): unknown } | null | undefined, detail: FormResultDetail): void {
  target?.dispatchEvent(new CustomEvent(FORM_RESULT_EVENT, { bubbles: true, detail }))
}
