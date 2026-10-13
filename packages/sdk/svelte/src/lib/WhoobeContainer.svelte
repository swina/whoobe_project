<script>
  import WhoobeNode from './WhoobeNode.svelte'
  import { animate } from './animate.js'
  export let descriptor
</script>

<svelte:element this={descriptor.tag} class={descriptor.className || undefined} style={descriptor.style || undefined} {...descriptor.attributes} use:animate={descriptor.node?.gsap}>
  {#each descriptor.children as child}
    <WhoobeNode descriptor={child} />
  {/each}
</svelte:element>
