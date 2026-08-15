<script>
  // button / submit / reset - the HTML type comes from the node kind.
  let { descriptor } = $props()
  const types = { button: 'button', submit: 'submit', reset: 'reset' }
  const type = $derived(types[descriptor.kind] ?? 'button')
</script>

<button {...descriptor.attributes} type={type} class={descriptor.className || undefined} style={descriptor.style || undefined}>
  {descriptor.content}
</button>
