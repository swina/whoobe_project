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
  .option('--gateway-url <url>', 'Base URL of the API Gateway (e.g. https://cms.example.com:3001), needed for Gateway-backed forms/bindings (Brevo, etc.) to work from the published site. Defaults to none (Gateway calls fall back to localhost).')
  .option('--base-path <path>', 'Path this site is mounted under behind nginx in production (e.g. /blog). Independent from the CMS\'s own website rootPath. Defaults to / (domain root).', '/')
  .option('--site-api-key <key>', 'Optional Gateway API key for this website (Settings > Publish > Gateway site key). Stored server-only - never baked into the client bundle - and sent alongside gateway_bindings checks for the site\'s Gateway traffic (docs/plans/api-gateway/gateway-auth-authz.md). Omit to rely on binding checks alone.')

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
  gatewayUrl: opts.gatewayUrl,
  basePath: opts.basePath,
  siteApiKey: opts.siteApiKey,
}).catch((err) => {
  console.error('Publish failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})