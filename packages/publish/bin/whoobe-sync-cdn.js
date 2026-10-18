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
  .option('--gateway-route-id <id>', 'Gateway route id for the CDN provider\'s upload route (preconfigured via the admin dashboard). Falls back to Settings → DAM → CDN Mirror\'s saved value if omitted (needs the service account to have the "objects:read" permission for that lookup) - required, one way or the other.')
  .option('--asset-processor-url <url>', 'Base URL of asset-processor, which actually performs the mirror. Defaults to --api-url (correct once behind nginx, which routes /api/v1/* to asset-processor under the same hostname as core-api) - set this explicitly in local dev, where asset-processor is on a different port (e.g. http://localhost:3002) than core-api.')
  .option('--upload-preset <name>', 'CDN provider upload preset (e.g. Cloudinary unsigned upload preset name). Also falls back to the saved CDN Mirror settings if omitted.')
  .option('--provider <name>', 'CDN provider id (defaults to whatever the Gateway route\'s preset implies, or the saved CDN Mirror settings)')

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
