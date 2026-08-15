<script>
  export let descriptor
</script>

{#if descriptor.image}
  <img src={descriptor.image.url} alt={descriptor.image.alt ?? ''} class={descriptor.className || undefined} style={descriptor.style || undefined} />
{/if}
