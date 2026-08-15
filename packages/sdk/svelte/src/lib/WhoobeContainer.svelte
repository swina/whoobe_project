<script>
  import WhoobeNode from './WhoobeNode.svelte'
  export let descriptor
</script>

<svelte:element this={descriptor.tag} class={descriptor.className || undefined} style={descriptor.style || undefined} {...descriptor.attributes}>
  {#each descriptor.children as child}
    <WhoobeNode descriptor={child} />
  {/each}
</svelte:element>
