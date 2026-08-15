<script>
  import WhoobeNode from './WhoobeNode.svelte'
  export let descriptor
</script>

{#if descriptor.link}
  <a href={descriptor.link.href} target={descriptor.link.target} class={descriptor.className || undefined} style={descriptor.style || undefined}>
    {#each descriptor.children as child}
      <WhoobeNode descriptor={child} />
    {/each}
  </a>
{:else}
  <span class={descriptor.className || undefined} style={descriptor.style || undefined}>
    {#each descriptor.children as child}
      <WhoobeNode descriptor={child} />
    {/each}
  </span>
{/if}
