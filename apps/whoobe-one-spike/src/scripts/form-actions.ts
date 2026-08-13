// Wires a Form element's configured submission handling (docs/plans/forms/
// cms-forms.md) to its live <form> DOM node - same "plain exported mount
// function, called from onMounted() in the preview tree only" shape as
// gsap-actions.ts's mountAnimation()/BlockElementPreview.vue's Alpine
// wiring, not a Vue directive or component of its own.
import type Element from './ElementsClass.js'
import { getDefaultCoreApiUrl } from '../data-objects-api'

type WhoobeElement = InstanceType<typeof Element>

export interface FormSubmitResult {
  ok: boolean
  message: string
}

/** Attaches a submit handler to `formEl`, gated on `doc.formConfig.enabled`
 *  + a chosen target class - a no-op mount (returns a no-op cleanup) for
 *  any Form that isn't configured yet, same "absent config does nothing"
 *  convention as mountAnimation()'s `!element.gsap?.animation` guard.
 *
 *  On submit: collects every input's value by its `name` attribute via the
 *  browser's own FormData serialization (no manual DOM walk, and this is
 *  exactly the same values a real, unhandled HTML form post would have
 *  sent), POSTs them to the new public submit endpoint, then on success
 *  either navigates to `successRedirectUrl` (when set) or reports a result
 *  back to the caller via `onResult` so the *Preview component can render
 *  `formConfig.successMessage` inline - symmetrically, on failure, either
 *  `errorRedirectUrl` (when set) or `errorMessage` inline.
 *
 *  Returns a cleanup function - the listener and the injected honeypot
 *  input both need to be torn down if this Form element unmounts (a
 *  data-bound repeater re-rendering its rows, DocumentPreview closing). */
export function mountFormSubmit(
  doc: WhoobeElement,
  formEl: HTMLFormElement,
  onResult: (result: FormSubmitResult | null) => void
): () => void {
  const config = (doc as any).formConfig
  if (!config?.enabled || !config.targetClassId) return () => {}

  // A hidden decoy field bots tend to fill in, real visitors never see or
  // touch - injected directly rather than as a real Element/input type so
  // it can't be seen, moved, or removed via the visual editor. The server
  // silently accepts (204, no row created) whenever this comes back non-
  // empty, without revealing that it's a trap.
  const honeypot = document.createElement('input')
  honeypot.type = 'text'
  honeypot.name = '_hp'
  honeypot.tabIndex = -1
  honeypot.autocomplete = 'off'
  honeypot.setAttribute('aria-hidden', 'true')
  honeypot.style.cssText = 'position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden;'
  formEl.appendChild(honeypot)

  async function onSubmit(e: Event) {
    e.preventDefault()
    onResult(null)
    const attributes = Object.fromEntries(new FormData(formEl).entries())
    try {
      const res = await fetch(`${getDefaultCoreApiUrl()}/public/forms/${config.targetClassId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // notify is included here (rather than looked up server-side by
        // classId) since the editor already has this Form's own config in
        // hand at submit time - see docs/plans/forms/cms-forms.md's Phase 2
        // section 4.
        body: JSON.stringify({ attributes, formConfig: { notify: config.notify } }),
      })
      if (!res.ok) throw new Error(`status ${res.status}`)
      if (config.successRedirectUrl) {
        window.location.href = config.successRedirectUrl
        return
      }
      formEl.reset()
      onResult({ ok: true, message: config.successMessage || 'Submitted.' })
    } catch (err) {
      console.warn('[form-actions] submit failed:', err)
      if (config.errorRedirectUrl) {
        window.location.href = config.errorRedirectUrl
        return
      }
      onResult({ ok: false, message: config.errorMessage || 'Something went wrong, please try again.' })
    }
  }

  formEl.addEventListener('submit', onSubmit)
  return () => {
    formEl.removeEventListener('submit', onSubmit)
    honeypot.remove()
  }
}
