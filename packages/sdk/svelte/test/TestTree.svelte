<script>
  // Test-only wrapper: nests WhoobeNode inside WhoobeProvider so the context
  // flows through a single render() call (a slot function passed to render()
  // runs outside the provider's context).
  import WhoobeProvider from '../src/lib/WhoobeProvider.svelte'
  import WhoobeNode from '../src/lib/WhoobeNode.svelte'

  export let registry = {}
  export let api
  export let assetBaseUrl
  export let descriptor
</script>

<WhoobeProvider {registry} {api} {assetBaseUrl}>
  <WhoobeNode {descriptor} />
</WhoobeProvider>
