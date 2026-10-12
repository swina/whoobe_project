// The publish runner (docs/plans/website/publish-from-dashboard.md). It holds no CMS database or object-store credentials: it pulls
// jobs from core-api over HTTP (outbound only), runs the generator and writes releases under PUBLISH_ROOT.
import { hostname } from 'node:os';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { runJob, type ClaimedJob, type Core } from './run.js';

// In development the shared repo .env holds PUBLISH_RUNNER_TOKEN (values already in the environment win).
for (const f of ['.env', '../../.env']) if (existsSync(f)) { try { process.loadEnvFile(f); } catch { /* unreadable: use the environment */ } }

const CORE_API_URL = (process.env.CORE_API_URL ?? 'http://localhost:3003').replace(/\/+$/, '');
const TOKEN = process.env.PUBLISH_RUNNER_TOKEN ?? '';
const ROOT = resolve(process.env.PUBLISH_ROOT ?? './published');
const NAME = process.env.PUBLISH_RUNNER_NAME ?? `publisher@${hostname()}`;
const POLL_MS = Number(process.env.PUBLISH_POLL_MS ?? 3000);
const TIMEOUT_MS = Number(process.env.PUBLISH_JOB_TIMEOUT_MS ?? 15 * 60_000);

if (!TOKEN) { console.error('PUBLISH_RUNNER_TOKEN is not set: the runner has no way to authenticate to core-api'); process.exit(1); }

async function call(path: string, body: unknown): Promise<Response> {
  return fetch(`${CORE_API_URL}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` }, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000) });
}

const core: Core = {
  async log(id, text) {
    const r = await call(`/publish/runner/jobs/${id}/log`, { text });
    return r.ok ? ((await r.json()) as { cancelRequested: boolean }) : null;
  },
  async finish(id, body) {
    const r = await call(`/publish/runner/jobs/${id}/finish`, body);
    if (!r.ok) console.error(`finish ${id}: core-api answered ${r.status}`);
  },
};

let stopping = false;
for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => { stopping = true; });

console.log(`publisher ${NAME}: core-api ${CORE_API_URL}, root ${ROOT}, poll ${POLL_MS} ms`);
while (!stopping) {
  try {
    const r = await call('/publish/runner/claim', { runner: NAME });
    if (r.status === 200) {
      const job = (await r.json()) as ClaimedJob;
      console.log(`job ${job.id}: ${job.options.slug} (${job.options.framework})`);
      await runJob(job, core, { root: ROOT, timeoutMs: TIMEOUT_MS, secrets: [TOKEN] });
      continue; // look for the next one at once
    }
    if (r.status !== 204) console.error(`claim: core-api answered ${r.status}`);
  } catch (e) {
    console.error(`claim failed: ${(e as Error).message}`);
  }
  await new Promise((res) => setTimeout(res, POLL_MS));
}
