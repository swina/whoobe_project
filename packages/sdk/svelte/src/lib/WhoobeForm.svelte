<script>
  // Form: renders its fields inside a <form>, wires submission to
  // POST /public/forms/:classId/submit via the injected api, injects the
  // honeypot, resets on success and shows a click-to-close result popup.
  import WhoobeNode from './WhoobeNode.svelte'
  import { getWhoobeContext } from './context.js'

  let { descriptor } = $props()

  const ctx = getWhoobeContext()
  let result = $state(null)

  async function onSubmit(e) {
    e.preventDefault()
    const fc = descriptor.formConfig
    if (!fc) return
    const formEl = e.currentTarget
    const attributes = Object.fromEntries(new FormData(formEl).entries())
    try {
      await ctx.api.submitForm(fc.targetClassId, attributes, { notify: fc.notify })
      formEl.reset()
      result = { ok: true, message: fc.successMessage || 'Submitted.' }
    } catch {
      result = { ok: false, message: fc.errorMessage || 'Something went wrong, please try again.' }
    }
  }
</script>

<form class={descriptor.className || undefined} style={descriptor.style || undefined} {...descriptor.attributes} onsubmit={onSubmit}>
  <input
    name="_hp"
    type="text"
    tabindex="-1"
    autocomplete="off"
    aria-hidden="true"
    style="position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden;"
  />
  {#each descriptor.children as child}
    <WhoobeNode descriptor={child} />
  {/each}
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
