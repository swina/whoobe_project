<script>
  // button / submit / reset - the HTML type comes from the node kind. With a resolved link (a button given a link, or a
  // Download element: its file) it is an <a>, `download` making the browser save the file instead of opening it.
  let { descriptor } = $props()
  const types = { button: 'button', submit: 'submit', reset: 'reset' }
  const type = $derived(types[descriptor.kind] ?? 'button')
</script>

{#if descriptor.link}
  <a {...descriptor.attributes} href={descriptor.link.href} target={descriptor.link.target} download={descriptor.link.download ? '' : undefined} class={descriptor.className || undefined} style={descriptor.style || undefined}>
    {descriptor.content}
  </a>
{:else}
  <button {...descriptor.attributes} type={type} class={descriptor.className || undefined} style={descriptor.style || undefined}>
    {descriptor.content}
  </button>
{/if}
