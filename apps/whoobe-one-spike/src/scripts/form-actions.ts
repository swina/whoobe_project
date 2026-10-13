// Wires a Form element's configured submission handling (docs/plans/forms/
// cms-forms.md) to its live <form> DOM node - same "plain exported mount
// function, called from onMounted() in the preview tree only" shape as
// animation-actions.ts's mountAnimation()/BlockElementPreview.vue's Alpine
// wiring, not a Vue directive or component of its own.
import type Element from './ElementsClass.js'
import { getDefaultCoreApiUrl } from '../core-api-url'
import { gatewayBaseUrl } from '../gateway-api'
import { dispatchFormResult, sanitizeOutcome, showsResultMessage } from './form-result'

type WhoobeElement = InstanceType<typeof Element>

export interface FormSubmitResult {
  ok: boolean
  message: string
}

/** A file the server refused (or could not take): its own message is what the visitor needs to read. */
class UploadRefused extends Error {}

/** The values of the form. A chosen file is not sent with it: it is uploaded first (the same two steps as ApiClient.uploadFile of
 *  the published sites: the server approves it and returns an address, then the bytes go there) and the form carries `{ uploadId }`. */
async function collectFormValues(formEl: HTMLFormElement, coreApiUrl: string | null): Promise<Record<string, unknown>> {
  const attributes: Record<string, unknown> = {}
  for (const [key, value] of new FormData(formEl).entries()) if (typeof value === 'string') attributes[key] = value
  for (const input of Array.from(formEl.querySelectorAll<HTMLInputElement>('input[type="file"]'))) {
    if (!input.name || !input.files || input.files.length === 0) continue
    const fieldId = input.getAttribute('data-whoobe-upload') || input.id
    if (!fieldId || !coreApiUrl) throw new UploadRefused('File upload is not available for this form')
    const refs: { uploadId: string }[] = []
    for (const file of Array.from(input.files)) refs.push({ uploadId: await uploadOneFile(coreApiUrl, fieldId, file) })
    attributes[input.name] = refs.length === 1 ? refs[0] : refs
  }
  return attributes
}

async function uploadOneFile(coreApiUrl: string, fieldId: string, file: File): Promise<string> {
  const intentRes = await fetch(`${coreApiUrl}/public/uploads/intent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fieldId, filename: file.name, size: file.size }),
  })
  const intent = await intentRes.json().catch(() => ({}))
  if (!intentRes.ok) throw new UploadRefused(intent?.error || 'The file could not be uploaded')
  const putRes = await fetch(intent.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' }, body: file })
  if (!putRes.ok) {
    const body = await putRes.json().catch(() => ({}))
    throw new UploadRefused(body?.error || 'The file could not be uploaded')
  }
  return intent.uploadId as string
}

/** Attaches a submit handler to `formEl`, gated on `doc.formConfig.enabled`
 *  + a chosen target (a data class or a gateway endpoint) - a no-op mount
 *  (returns a no-op cleanup) for any Form that isn't configured yet, same
 *  "absent config does nothing" convention as mountAnimation()'s
 *  `!element.gsap?.animation` guard.
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
  if (!config?.enabled || (!config.targetClassId && !config.gatewayEndpointName)) return () => {}

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
    try {
      const attributes = await collectFormValues(formEl, config.gatewayBindingId ? null : getDefaultCoreApiUrl())
      // Gateway-targeted Forms (config.gatewayEndpointName set) forward to
      // the Gateway's public submit route instead of core-api's Data Object
      // one - but only by bindingId, resolved server-side at page-save time
      // (core-api's bind-page-content.ts, docs/plans/api-gateway/gateway-
      // auth-authz.md), same as ApiClient.submitForm() for published sites.
      // A Form configured with a gateway target that hasn't been saved yet
      // has no bindingId - rather than silently posting nothing useful, tell
      // the editor to save first.
      if (config.gatewayEndpointName && !config.gatewayBindingId) {
        onResult({ ok: false, message: 'Save the page to test this form.' })
        return
      }
      const res = config.gatewayBindingId
        ? await fetch(`${gatewayBaseUrl()}/api/v1/gateway/submit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              bindingId: config.gatewayBindingId,
              attributes,
            }),
          })
        : await fetch(`${getDefaultCoreApiUrl()}/public/forms/${config.targetClassId}/submit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            // notify is included here (rather than looked up server-side by
            // classId) since the editor already has this Form's own config in
            // hand at submit time - see docs/plans/forms/cms-forms.md's Phase 2
            // section 4.
            body: JSON.stringify({ attributes, formConfig: { notify: config.notify } }),
          })
      if (!res.ok) throw new Error(`status ${res.status}`)
      // a Gateway form's service may answer an outcome key (n8n: `{ "outcome": "qualified" }`): the page reacts to it through the
      // `whoobe-form-result` event (docs/plans/automations/form-result-event.md); nothing else of the reply is used
      const reply = config.gatewayBindingId ? await res.json().catch(() => null) : null
      dispatchFormResult(formEl, { ok: true, outcome: sanitizeOutcome(reply?.outcome) })
      if (config.successRedirectUrl) {
        window.location.href = config.successRedirectUrl
        return
      }
      formEl.reset()
      onResult(showsResultMessage(config) ? { ok: true, message: config.successMessage || 'Submitted.' } : null)
    } catch (err) {
      console.warn('[form-actions] submit failed:', err)
      dispatchFormResult(formEl, { ok: false, outcome: null })
      if (config.errorRedirectUrl) {
        window.location.href = config.errorRedirectUrl
        return
      }
      onResult(showsResultMessage(config) ? { ok: false, message: err instanceof UploadRefused ? err.message : config.errorMessage || 'Something went wrong, please try again.' } : null)
    }
  }

  formEl.addEventListener('submit', onSubmit)
  return () => {
    formEl.removeEventListener('submit', onSubmit)
    honeypot.remove()
  }
}
