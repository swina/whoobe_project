import { defineConfig } from '@playwright/test'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

const pad = (n: number) => String(n).padStart(2, '0')
const d = new Date()
const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const time = `${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`

export default defineConfig({
  testDir: './browser',
  timeout: 90_000,
  workers: 1,                // one stack, order-sensitive fixtures
  retries: 0,
  fullyParallel: false,
  reporter: [
    ['list'],
    // timestamped evidence next to the API/static reports (git-ignored)
    ['json', { outputFile: resolve(here, 'reports', date, `browser-${date}_${time}.json`) }],
  ],
  use: { headless: true, viewport: { width: 1400, height: 900 }, ignoreHTTPSErrors: true },
})
