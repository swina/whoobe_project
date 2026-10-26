// Runs one job: `whoobe-publish` with an argument array (never a shell string), output streamed to core-api with secrets masked.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { rm } from 'node:fs/promises';
import { prepareReleaseDir, pruneReleases, releaseDirFor, switchCurrent } from './release.js';

export interface ClaimedJob {
  id: string; websiteId: string; releasePath: string;
  /** The gateway site key of this run, given once by core-api; reaches the generator through its environment, never its arguments. */
  siteKey?: string | null;
  options: { apiUrl: string; framework: 'next' | 'vue'; slug: string; revalidate: number; domain?: string; assetBaseUrl?: string; gatewayUrl?: string; basePath?: string };
}
export interface Core {
  log(id: string, text: string): Promise<{ cancelRequested: boolean } | null>;
  finish(id: string, body: { status: 'succeeded' | 'failed' | 'cancelled'; error?: string; releasePath?: string }): Promise<void>;
}

/** Replaces every secret value (and long token-like `key=value` pairs) in a line. */
export function mask(text: string, secrets: string[]): string {
  let out = text;
  for (const s of secrets) if (s.length >= 8) out = out.split(s).join('***');
  return out.replace(/((?:site[-_]?api[-_]?key|token|password|secret)["']?\s*[:=]\s*["']?)[A-Za-z0-9._~+/-]{8,}/gi, '$1***');
}

/** The arguments of the generator, from the validated job options. Exported for tests. */
export function generatorArgs(job: ClaimedJob, outDir: string): string[] {
  const o = job.options;
  const a = ['--api-url', o.apiUrl, '--website-id', job.websiteId, '--out-dir', outDir, '--framework', o.framework, '--revalidate', String(o.revalidate)];
  if (o.domain) a.push('--domain', o.domain);
  if (o.assetBaseUrl) a.push('--asset-base-url', o.assetBaseUrl);
  if (o.gatewayUrl) a.push('--gateway-url', o.gatewayUrl);
  if (o.basePath) a.push('--base-path', o.basePath);
  return a;
}

export interface RunConfig { root: string; timeoutMs: number; secrets: string[]; bin?: string }

const DEFAULT_BIN = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'packages', 'publish', 'bin', 'whoobe-publish.js');

export async function runJob(job: ClaimedJob, core: Core, cfg: RunConfig): Promise<void> {
  let releaseDir: string;
  try { releaseDir = releaseDirFor(cfg.root, job.options.slug, job.id); } catch (e) { await core.finish(job.id, { status: 'failed', error: (e as Error).message }); return; }
  await prepareReleaseDir(releaseDir);

  let pending = '';
  let tail = '';
  let cancel = false;
  const flush = async (): Promise<void> => {
    if (!pending) return;
    const text = pending; pending = '';
    const state = await core.log(job.id, text).catch(() => null);
    if (state?.cancelRequested) { cancel = true; child.kill('SIGTERM'); setTimeout(() => child.kill('SIGKILL'), 5000).unref(); }
  };
  const take = (chunk: Buffer): void => {
    const text = mask(chunk.toString('utf8'), job.siteKey ? [...cfg.secrets, job.siteKey] : cfg.secrets);
    pending += text; tail = (tail + text).slice(-2000);
  };

  // a minimal environment: the generator needs PATH and HOME, and in the image the folder of the SDK packed at build time
  // (the image has no pnpm, F-063); nothing of the runner's own configuration
  const env: Record<string, string> = { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '/tmp', NODE_ENV: 'production', CI: 'true' };
  if (process.env.WHOOBE_SDK_TARBALL_DIR) env.WHOOBE_SDK_TARBALL_DIR = process.env.WHOOBE_SDK_TARBALL_DIR;
  if (job.siteKey) env.WHOOBE_SITE_API_KEY = job.siteKey;
  const child = spawn(process.execPath, [cfg.bin ?? DEFAULT_BIN, ...generatorArgs(job, releaseDir)], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', take); child.stderr.on('data', take);
  const timer = setInterval(() => { void flush(); }, 1000);
  let timedOut = false;
  const killer = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); setTimeout(() => child.kill('SIGKILL'), 5000).unref(); }, cfg.timeoutMs);

  const code: number | null = await new Promise((res) => { child.on('error', () => res(-1)); child.on('close', (c) => res(c)); });
  clearInterval(timer); clearTimeout(killer);
  await flush();

  if (code === 0 && !cancel) {
    try {
      await switchCurrent(releaseDir);
      await pruneReleases(dirname(dirname(releaseDir)), releaseDir);
      await core.finish(job.id, { status: 'succeeded', releasePath: job.releasePath });
    } catch (e) {
      await core.finish(job.id, { status: 'failed', error: `The release could not be switched: ${(e as Error).message}` });
    }
    return;
  }
  // a failed or cancelled job leaves the live version alone; its half-written release goes
  await rm(releaseDir, { recursive: true, force: true }).catch(() => undefined);
  if (cancel) await core.finish(job.id, { status: 'cancelled' });
  else await core.finish(job.id, { status: 'failed', error: timedOut ? `Stopped after ${Math.round(cfg.timeoutMs / 60000)} minutes` : (tail.trim().split('\n').pop() || `The generator exited with code ${code}`) });
}
