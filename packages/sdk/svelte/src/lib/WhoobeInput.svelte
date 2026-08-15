<script>
  export let descriptor
</script>

<input {...descriptor.attributes} class={descriptor.className || undefined} style={descriptor.style || undefined} />
