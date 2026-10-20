<script>
  import WhoobeNode from './WhoobeNode.svelte'
  import { sanitizeRichText } from '@whoobe-cms/schema'
  export let descriptor
</script>

{#if descriptor.link}
  <a href={descriptor.link.href} target={descriptor.link.target} class={descriptor.className || undefined} style={descriptor.style || undefined}>
    {#if !descriptor.children.length && descriptor.content}{@html sanitizeRichText(descriptor.content)}{/if}
    {#each descriptor.children as child}
      <WhoobeNode descriptor={child} />
    {/each}
  </a>
{:else}
  <span class={descriptor.className || undefined} style={descriptor.style || undefined}>
    {#if !descriptor.children.length && descriptor.content}{@html sanitizeRichText(descriptor.content)}{/if}
    {#each descriptor.children as child}
      <WhoobeNode descriptor={child} />
    {/each}
  </span>
{/if}
