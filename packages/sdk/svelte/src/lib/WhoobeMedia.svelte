<script>
  // Light media defaults - consumers usually map these to their own players.
  import WhoobeNode from './WhoobeNode.svelte'
  export let descriptor
</script>

{#if descriptor.kind === 'video'}
  <video {...descriptor.attributes} src={descriptor.node.src ?? undefined} controls class={descriptor.className || undefined} style={descriptor.style || undefined}></video>
{:else if descriptor.kind === 'youtube' || descriptor.kind === 'vimeo'}
  <div class={descriptor.className || undefined} style={descriptor.style || undefined} data-embed={descriptor.kind}>
    {descriptor.content}
  </div>
{:else}
  <div class={descriptor.className || undefined} style={descriptor.style || undefined} data-slider="true">
    {#each descriptor.children as child}
      <WhoobeNode descriptor={child} />
    {/each}
  </div>
{/if}
