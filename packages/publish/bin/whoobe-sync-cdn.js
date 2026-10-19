#!/usr/bin/env node
import { Command } from 'commander'
import { syncCdnAssets } from '../dist/sync-cdn-assets.js'

const program = new Command()

program
  .name('whoobe-sync-cdn')
  .description(
    'Mirror every image referenced by a website\'s published pages to the configured CDN ' +
    '(docs/plans/assets/assets-cdn.md), so a published site can serve them from the CDN ' +
    'instead of this install\'s own DAM proxy. Run before/alongside publishing a production site.',
  )
  .requiredOption('--api-url <url>', 'Base URL of the Whoobe public API / core-api (e.g. https://cms.example.com, or http://localhost:3003 in local dev)')
  .requiredOption('--website-id <id>', 'UUID of the website to sync')
  .option('--gateway-route-id <id>', 'OLD WAY, Cloudinary only: a Gateway route id for its upload route. Leave it out: the CDN set for the website (its own, else the installation\'s default; Cloudinary or Cloudflare Images) is used, asked from the server (the service account needs the "objects:read" permission).')
  .option('--asset-processor-url <url>', 'Base URL of asset-processor, which actually performs the mirror. Defaults to --api-url (correct once behind nginx, which routes /api/v1/* to asset-processor under the same hostname as core-api) - set this explicitly in local dev, where asset-processor is on a different port (e.g. http://localhost:3002) than core-api.')
  .option('--upload-preset <name>', 'Cloudinary unsigned upload preset, only together with --gateway-route-id (the old way). Otherwise the preset is part of the website\'s CDN settings.')
  .option('--provider <name>', 'Label stored with the mirror when --gateway-route-id is used (default cloudinary); otherwise the provider of the website\'s CDN settings is used')

program.parse()

const opts = program.opts()

// Service-account credentials are read from env only, never from CLI args -
// a CLI flag would leak into `ps`/shell history.
const email = process.env.WHOOBE_SYNC_EMAIL
const password = process.env.WHOOBE_SYNC_PASSWORD
if (!email || !password) {
  console.error('WHOOBE_SYNC_EMAIL and WHOOBE_SYNC_PASSWORD env vars are required (a dedicated service account, without MFA, for automation).')
  process.exit(1)
}

syncCdnAssets({
  apiUrl: opts.apiUrl,
  websiteId: opts.websiteId,
  email,
  password,
  gatewayRouteId: opts.gatewayRouteId,
  uploadPreset: opts.uploadPreset,
  provider: opts.provider,
  assetProcessorUrl: opts.assetProcessorUrl,
}).catch((err) => {
  console.error('CDN sync failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
