#!/usr/bin/env node
import { Command } from 'commander'
import { generateMobileApp } from '../dist/cli.js'

const program = new Command()

program
  .name('whoobe-mobile')
  .description('Generate a Capacitor mobile app from Whoobe CMS')
  .requiredOption('--api-url <url>', 'Base URL of the Whoobe CMS public API (e.g. https://cms.example.com)')
  .requiredOption('--website-id <id>', 'UUID of the website to publish')
  .requiredOption('--out-dir <path>', 'Output directory for the generated mobile app')
  .option('--domain <domain>', 'Custom domain for the API (defaults to api-url host)')
  .option('--app-name <name>', 'Display name for the mobile app (defaults to website name)')
  .option('--app-id <id>', 'Bundle identifier (defaults to com.whoobe.mobile.<website-slug>)')
  .option('--static', 'Inline all page content and images — fully offline, no CMS needed at runtime')

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
}).catch((err) => {
  console.error('Mobile app generation failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})