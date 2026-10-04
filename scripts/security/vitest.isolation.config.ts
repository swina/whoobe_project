import { defineConfig } from 'vitest/config'

// Two stacks standing for two workspaces (see isolation/isolation.test.ts). No globalSetup: the role users of the
// main suites are not needed, and B has none.
export default defineConfig({
  test: {
    include: ['isolation/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
    reporters: ['default', './lib/summary-reporter.ts'],
  },
})
