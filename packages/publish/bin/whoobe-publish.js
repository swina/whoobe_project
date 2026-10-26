#!/usr/bin/env node
import { Command } from 'commander'
import { generateNextSite, generateNuxtSite, generateDocsSite } from '../dist/cli.js'

const program = new Command()

program
  .name('whoobe-publish')
  .description('Generate a deployable website from Whoobe')
  .requiredOption('--api-url <url>', 'Base URL of the Whoobe public API (e.g. https://cms.example.com)')
  .requiredOption('--website-id <id>', 'UUID of the website to publish')
  .requiredOption('--out-dir <path>', 'Output directory for the generated project')
  .option('--kind <kind>', 'What to generate: site (a website, with --framework) or docs (a documentation website as static HTML)', 'site')
  .option('--framework <name>', 'Target framework (next, vue) - for --kind site. Svelte has an SDK adapter but no site generator.', 'next')
  .option('--site-url <url>', 'docs: public address of the site (https://docs.example.com), for the sitemap and canonical links')
  .option('--no-copy-assets', 'docs: link to the files in the CMS instead of copying them into the output')
  .option('--strict', 'docs: fail when a document has a broken link')
  .option('--version-label <text>', 'docs: badge after the site title, e.g. v0.3.1')
  .option('--version-url <url>', 'docs: where the version badge links to (the release notes)')
  .option('--repo-url <url>', 'docs: source repository, linked from the header')
  .option('--revalidate <seconds>', 'ISR revalidate time in seconds', '60')
  .option('--domain <domain>', 'Custom domain for the published site')
  .option('--asset-base-url <url>', 'Public base URL for DAM assets (e.g. https://media.example.com). Defaults to the API URL host.')
  .option('--gateway-url <url>', 'Base URL of the API Gateway (e.g. https://cms.example.com:3001), needed for Gateway-backed forms/bindings (Brevo, etc.) to work from the published site. Defaults to none (Gateway calls fall back to localhost).')
  .option('--base-path <path>', 'Path this site is mounted under behind nginx in production (e.g. /blog). Independent from the CMS\'s own website rootPath. Defaults to / (domain root).', '/')
  .option('--site-api-key <key>', 'Optional Gateway API key for this website (Settings > Publish > Gateway site key). Stored server-only - never baked into the client bundle - and sent alongside gateway_bindings checks for the site\'s Gateway traffic (docs/plans/api-gateway/gateway-auth-authz.md). Omit to rely on binding checks alone.')
  .option('--clean', 'site: empty the output folder before generating (keeps node_modules, .git and the lockfile), so removed pages and stale caches do not linger. Refuses a folder that is not a generated site.')

program.parse()

const opts = program.opts()
if (opts.kind === 'docs') {
  generateDocsSite({ apiUrl: opts.apiUrl, websiteId: opts.websiteId, outDir: opts.outDir, basePath: opts.basePath, siteUrl: opts.siteUrl, assetBaseUrl: opts.assetBaseUrl, copyAssets: opts.copyAssets, strict: !!opts.strict, versionLabel: opts.versionLabel, versionUrl: opts.versionUrl, repoUrl: opts.repoUrl })
    .catch((err) => { console.error('Publish failed:', err instanceof Error ? err.message : err); process.exit(1) })
} else {
if (opts.framework !== 'vue' && opts.framework !== 'next') { console.error(`Unknown framework "${opts.framework}": use next or vue (Svelte has an SDK adapter but no site generator).`); process.exit(2) }
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
  // the flag shows in the process list; a runner passes the key in the environment instead
  siteApiKey: opts.siteApiKey ?? process.env.WHOOBE_SITE_API_KEY,
  clean: !!opts.clean,
}).catch((err) => {
  console.error('Publish failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
}
