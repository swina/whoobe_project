<script>
  import { onMount, onDestroy } from 'svelte'
  import WhoobeNode from './WhoobeNode.svelte'
  import { animate } from './animate.js'
  import { getWhoobeContext } from './context.js'
  import { startDynamicList } from './dynamic.js'
  export let descriptor

  // A list that depends on a selection is filled in the browser (see dynamic.js)
  const ctx = getWhoobeContext()
  let dynamicKids = []
  let stop = null
  onMount(() => {
    if (descriptor.dynamicList) stop = startDynamicList(descriptor, ctx, (kids) => { dynamicKids = kids })
  })
  onDestroy(() => stop?.())
  $: kids = descriptor.dynamicList ? dynamicKids : descriptor.children
</script>

<svelte:element this={descriptor.tag} class={descriptor.className || undefined} style={descriptor.style || undefined} {...descriptor.attributes} use:animate={descriptor.node?.gsap}>
  {#each kids as child}
    <WhoobeNode descriptor={child} />
  {/each}
</svelte:element>
