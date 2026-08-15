<script>
  // Provides the registry + api + options to the subtree via Svelte context.
  import { setWhoobeContext } from './context.js'

  export let registry = {}
  export let api
  export let assetBaseUrl
  export let keyPrefix
  export let resolveTargetPage

  setWhoobeContext({
    registry,
    api,
    options: { assetBaseUrl, keyPrefix, resolveTargetPage },
  })
</script>

<slot />
