<script>
  // Fetches a page, validates + walks it, and renders the root node.
  // Accepts a pre-walked `descriptor` prop for the SSR path (walk once
  // server-side, hydrate from the descriptor).
  import { walkTree } from '@whoobe-cms/renderer'
  import { getWhoobeContext } from './context.js'
  import WhoobeNode from './WhoobeNode.svelte'

  let { locale, path, websiteId, descriptor } = $props()

  const ctx = getWhoobeContext()
  // svelte-ignore state_referenced_locally - intentionally captures the
  // SSR-provided `descriptor` prop once; client loads replace it via $effect.
  const initial = descriptor
  let status = $state(initial ? 'ready' : 'loading')
  let error = $state(null)
  let resolved = $state(initial ?? null)

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
        resolved = await walkTree(lookup.page.content, {}, {
          api: ctx.api,
          assetBaseUrl: ctx.options.assetBaseUrl,
          keyPrefix: ctx.options.keyPrefix,
          resolveTargetPage: ctx.options.resolveTargetPage,
        })
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
  <WhoobeNode descriptor={resolved} />
{:else}
  <div class="whoobe-loading">Loading…</div>
{/if}
