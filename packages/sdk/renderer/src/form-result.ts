// What a form tells the page when a submission ends (docs/plans/automations/form-result-event.md). The form dispatches a DOM event
// on its <form> element; the page reacts with the directives of any element (AlpineJS: `@whoobe-form-result="outcome = $event.detail.outcome"`).
// The `outcome` is a short key chosen by the service the form is wired to (an n8n workflow answers `{ "outcome": "qualified" }`). It is the
// ONLY part of that service's reply that reaches the page: a plain key, never text or markup, so nothing a third party sends can end up
// in the visitor's DOM.

/** Name of the DOM event (bubbles, so an ancestor of the form can listen for it). */
export const FORM_RESULT_EVENT = 'whoobe-form-result'

export interface FormResultDetail {
  ok: boolean
  /** The outcome key the service answered, or null (no service reply, an invalid key, or a failed submission). */
  outcome: string | null
}

const OUTCOME_KEY = /^[A-Za-z0-9_-]{1,32}$/

/** The value if it is a valid outcome key (1-32 letters, digits, `_` or `-`), otherwise null. */
export function sanitizeOutcome(value: unknown): string | null {
  return typeof value === 'string' && OUTCOME_KEY.test(value) ? value : null
}

/** `formConfig.showResultMessage` is true when absent: a form saved before the option existed keeps showing its message. */
export function showsResultMessage(formConfig: { showResultMessage?: boolean } | null | undefined): boolean {
  return formConfig?.showResultMessage !== false
}

/** Dispatches the result event on the form element (`target` is typed loosely so this also runs under test without a DOM). */
export function dispatchFormResult(target: { dispatchEvent(event: any): unknown } | null | undefined, detail: FormResultDetail): void {
  target?.dispatchEvent(new CustomEvent(FORM_RESULT_EVENT, { bubbles: true, detail }))
}
