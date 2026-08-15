<script>
  export let descriptor
</script>

<select {...descriptor.attributes} class={descriptor.className || undefined} style={descriptor.style || undefined}>
  {#each descriptor.options ?? [] as option}
    <option value={option.value}>{option.label}</option>
  {/each}
</select>
