import { defaults, type Registry } from '@whoobe-cms/next'

// Custom component overrides can be added here.
// Example:
// import MyContainer from '@/components/MyContainer'
// const overrides: Partial<Registry> = { container: MyContainer }

export function createRegistry(): Registry {
  return { ...defaults }
}
