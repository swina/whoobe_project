import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['api/**/*.test.ts'],
    globalSetup: ['./setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 120_000,
    // Tests share one stack and one DB, and lockout/rate-limit tests are order-sensitive.
    fileParallelism: false,
  },
})
