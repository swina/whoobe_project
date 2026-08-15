<script>
  export let descriptor
</script>

<textarea {...descriptor.attributes} class={descriptor.className || undefined} style={descriptor.style || undefined}>{descriptor.content}</textarea>
