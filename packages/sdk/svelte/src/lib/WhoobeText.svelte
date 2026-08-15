<script>
  // Text nodes (heading/paragraph/span/blockquote/code/icon) - renders the
  // resolved tag with the safe-HTML content.
  export let descriptor
</script>

<svelte:element this={descriptor.tag} class={descriptor.className || undefined} style={descriptor.style || undefined} {...descriptor.attributes}>
  {@html descriptor.content}
</svelte:element>
