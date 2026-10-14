<script>
  // Form: renders its fields inside a <form>, wires submission to
  // POST /public/forms/:classId/submit via the injected api, injects the
  // honeypot, resets on success and shows a click-to-close result popup.
  import WhoobeNode from './WhoobeNode.svelte'
  import { getWhoobeContext } from './context.js'
  import { collectFormValues, dispatchFormResult, sanitizeOutcome, showsResultMessage, hidesFormOnSuccess, submitErrorMessage } from '@whoobe-cms/renderer'

  let { descriptor } = $props()

  const ctx = getWhoobeContext()
  let result = $state(null)
  let sent = $state(false)
  // "Hide the form once it has been sent": the fields go at once; the form's own box goes when the message popup (inside it) is closed
  const formStyle = $derived(sent && !result ? `${descriptor.style ? descriptor.style + ';' : ''}display:none` : descriptor.style || undefined)

  async function onSubmit(e) {
    e.preventDefault()
    const fc = descriptor.formConfig
    if (!fc) return
    const formEl = e.currentTarget
    try {
      const attributes = await collectFormValues(formEl, ctx.api.uploadFile?.bind(ctx.api))
      const reply = await ctx.api.submitForm(fc.targetClassId, attributes, {
        notify: fc.notify,
        gatewayBindingId: fc.gatewayBindingId,
      })
      formEl.reset()
      if (hidesFormOnSuccess(fc)) sent = true
      result = showsResultMessage(fc) ? { ok: true, message: fc.successMessage || 'Submitted.' } : null
      dispatchFormResult(formEl, { ok: true, outcome: sanitizeOutcome(reply?.outcome) })
    } catch (err) {
      result = showsResultMessage(fc) ? { ok: false, message: submitErrorMessage(err, fc.errorMessage) } : null
      dispatchFormResult(formEl, { ok: false, outcome: null })
    }
  }
</script>

<form class={descriptor.className || undefined} style={formStyle} {...descriptor.attributes} onsubmit={onSubmit}>
  <input
    name="_hp"
    type="text"
    tabindex="-1"
    autocomplete="off"
    aria-hidden="true"
    style="position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden;"
  />
  {#if !sent}
    {#each descriptor.children as child}
      <WhoobeNode descriptor={child} />
    {/each}
  {/if}
  {#if result}
    <div
      class="fixed inset-0 z-[100000] bg-black/60 flex items-center justify-center p-4 cursor-pointer"
      onclick={() => (result = null)}
    >
      <div class="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 text-sm {result.ok ? 'text-emerald-700' : 'text-rose-700'}">
        {@html result.message}
      </div>
    </div>
  {/if}
</form>
