<script>
  // Test-only: a consumer-style registry component that overrides the
  // default paragraph rendering.
  export let descriptor
</script>

<mark class={descriptor.className}>{@html descriptor.content}</mark>
