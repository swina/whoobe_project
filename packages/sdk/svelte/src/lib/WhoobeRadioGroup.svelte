<script>
  export let descriptor
  const name = descriptor.attributes?.name ?? ''
</script>

<div class={descriptor.className || undefined} style={descriptor.style || undefined}>
  {#each descriptor.options ?? [] as option}
    <label class="flex items-center gap-1">
      <input type="radio" {name} value={option.value} />
      {option.label}
    </label>
  {/each}
</div>
