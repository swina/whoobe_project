// Ambient declaration so tsc (used by the `typecheck` script alongside
// svelte-check) can resolve `.svelte` imports from the TS files in this
// package.
declare module '*.svelte' {
  import type { ComponentType } from 'svelte'
  const component: ComponentType
  export default component
}
