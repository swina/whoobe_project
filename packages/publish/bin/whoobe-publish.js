#!/usr/bin/env node
import { Command } from 'commander'
import { generateNextSite, generateNuxtSite } from '../dist/cli.js'

const program = new Command()

program
  .name('whoobe-publish')
  .description('Generate a deployable website from Whoobe CMS')
  .requiredOption('--api-url <url>', 'Base URL of the Whoobe CMS public API (e.g. https://cms.example.com)')
  .requiredOption('--website-id <id>', 'UUID of the website to publish')
  .requiredOption('--out-dir <path>', 'Output directory for the generated project')
  .option('--framework <name>', 'Target framework (next, vue, svelte)', 'next')
  .option('--revalidate <seconds>', 'ISR revalidate time in seconds', '60')
  .option('--domain <domain>', 'Custom domain for the published site')
  .option('--asset-base-url <url>', 'Public base URL for DAM assets (e.g. https://media.example.com). Defaults to the API URL host.')

program.parse()

const opts = program.opts()
const generator = opts.framework === 'vue' ? generateNuxtSite : generateNextSite
generator({
  apiUrl: opts.apiUrl,
  websiteId: opts.websiteId,
  outDir: opts.outDir,
  framework: opts.framework,
  revalidate: parseInt(opts.revalidate, 10),
  domain: opts.domain,
  assetBaseUrl: opts.assetBaseUrl,
}).catch((err) => {
  console.error('Publish failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})