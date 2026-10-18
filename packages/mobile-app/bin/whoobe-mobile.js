#!/usr/bin/env node
import { Command } from 'commander'
import { generateMobileApp } from '../dist/cli.js'

const program = new Command()

program
  .name('whoobe-mobile')
  .description('Generate a Capacitor mobile app from Whoobe')
  .requiredOption('--api-url <url>', 'Base URL of the Whoobe public API (e.g. https://cms.example.com)')
  .requiredOption('--website-id <id>', 'UUID of the website to publish')
  .requiredOption('--out-dir <path>', 'Output directory for the generated mobile app')
  .option('--domain <domain>', 'Custom domain for the API (defaults to api-url host)')
  .option('--app-name <name>', 'Display name for the mobile app (defaults to website name)')
  .option('--app-id <id>', 'Bundle identifier (defaults to com.whoobe.mobile.<website-slug>)')
  .option('--static', 'Inline all page content and images — fully offline, no CMS needed at runtime')
  .option('--gateway-url <url>', 'Base URL of the API Gateway, needed for gateway-backed forms/bindings (e.g. https://cms.example.com:3001)')
  .option('--site-api-key <key>', 'Optional Gateway API key for this website (Settings > Publish > Gateway site key). Stored in .env as VITE_SITE_API_KEY.')

program.parse()

const opts = program.opts()

generateMobileApp({
  apiUrl: opts.apiUrl,
  websiteId: opts.websiteId,
  outDir: opts.outDir,
  domain: opts.domain,
  appName: opts.appName,
  appId: opts.appId,
  static: opts.static ?? false,
  gatewayUrl: opts.gatewayUrl,
  siteApiKey: opts.siteApiKey,
}).catch((err) => {
  console.error('Mobile app generation failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})