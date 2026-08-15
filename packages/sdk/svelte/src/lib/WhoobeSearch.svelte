<script>
  // Search: input + submit wired to the public /public/search endpoint.
  import { getWhoobeContext } from './context.js'

  let { descriptor } = $props()

  const ctx = getWhoobeContext()
  let q = $state('')
  let results = $state([])

  async function run(e) {
    e.preventDefault()
    const res = await ctx.api.search({ q })
    results = res.results ?? []
  }
</script>

<form class={descriptor.className || undefined} style={descriptor.style || undefined} onsubmit={run}>
  <input {...descriptor.attributes} bind:value={q} />
  <button type="submit">{descriptor.searchConfig?.buttonLabel || 'Search'}</button>
  {#if results.length}
    <ul class={descriptor.searchConfig?.dropdownClass}>
      {#each results as r}
        <li>{r.title ?? r.name ?? r.id}</li>
      {/each}
    </ul>
  {/if}
</form>
