<script>
  // Recursive descriptor renderer - resolves the component for the node's
  // `kind` from the registry (falling back to built-in defaults) and renders
  // it with the descriptor. Child components map descriptor.children
  // themselves via <WhoobeNode>.
  import { getWhoobeContext } from './context.js'
  import { defaults } from './defaults.js'

  let { descriptor } = $props()

  const ctx = getWhoobeContext()
  const Comp = $derived(ctx?.registry?.[descriptor.kind] ?? defaults[descriptor.kind] ?? defaults.container)
</script>

<Comp {descriptor} />
