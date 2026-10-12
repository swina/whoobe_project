<script>
  // Fetches a page, validates + walks it, and renders the root node - or the
  // header/aside/main/footer shell when the website has a template. Accepts
  // a pre-walked `descriptor`/`layout` for the SSR path (walk once
  // server-side, hydrate from the descriptors).
  import { walkTree, composeLayout } from '@whoobe-cms/renderer'
  import { getWhoobeContext } from './context.js'
  import WhoobeNode from './WhoobeNode.svelte'

  let { locale, path, websiteId, descriptor, layout } = $props()

  const ctx = getWhoobeContext()
  // svelte-ignore state_referenced_locally - intentionally captures the
  // SSR-provided props once; client loads replace them via $effect.
  const initial = descriptor
  const initialLayout = layout
  let status = $state(initial ? 'ready' : 'loading')
  let error = $state(null)
  let resolved = $state(initial ?? null)
  let composed = $state(initialLayout ?? null)

  $effect(() => {
    if (resolved) return
    if (!locale || !path) {
      status = 'error'
      error = 'locale and path are required'
      return
    }
    status = 'loading'
    ctx.api
      .getPage(locale, path, websiteId)
      .then(async (lookup) => {
        const walkOptions = {
          api: ctx.api,
          assetBaseUrl: ctx.options.assetBaseUrl,
          keyPrefix: ctx.options.keyPrefix,
          resolveTargetPage: ctx.options.resolveTargetPage,
          tableMaxRows: ctx.options.tableMaxRows,
        }
        const walked = await walkTree(lookup.page.content, {}, walkOptions)
        resolved = walked
        composed = lookup.layout ? await composeLayout(walked, lookup.layout, walkOptions) : null
        status = 'ready'
      })
      .catch((e) => {
        status = 'error'
        error = e?.message ?? 'Failed to load page'
      })
  })
</script>

{#if status === 'error'}
  <div class="whoobe-error">{error}</div>
{:else if resolved}
  {#if composed}
    <div class="whoobe-page">
      {#if composed.header}<WhoobeNode descriptor={composed.header} />{/if}
      {#if composed.aside}<WhoobeNode descriptor={composed.aside} />{/if}
      <main class="whoobe-page-body">
        <WhoobeNode descriptor={resolved} />
      </main>
      {#if composed.footer}<WhoobeNode descriptor={composed.footer} />{/if}
    </div>
  {:else}
    <WhoobeNode descriptor={resolved} />
  {/if}
{:else}
  <div class="whoobe-loading">Loading…</div>
{/if}
