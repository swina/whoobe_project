// CDN providers for asset mirroring (docs/plans/assets/cdn-providers-plan.md). An adapter says which settings the form shows, checks them, and does the
// upload. The transport is not always the Gateway: Cloudinary goes through a Gateway route (a JSON body), Cloudflare Images needs multipart/form-data
// with the bytes, which the Gateway's route executor cannot send, so that adapter calls the API itself (through the outbound guard).

export interface CdnProviderField {
  name: string;
  label: string;
  required?: boolean;
  /** stored encrypted, never returned to a browser */
  secret?: boolean;
  help?: string;
  placeholder?: string;
}

export interface CdnProviderInfo {
  id: string;
  label: string;
  description: string;
  fields: CdnProviderField[];
}

export const CDN_PROVIDERS: CdnProviderInfo[] = [
  {
    id: 'cloudinary',
    label: 'Cloudinary',
    description: 'Uploads through a Gateway endpoint and route (the Cloudinary preset of Integrations has the upload route) with an unsigned upload preset.',
    fields: [
      { name: 'gatewayRouteId', label: 'Gateway upload route', required: true, help: 'The route that posts to image/upload, chosen from your Integrations endpoints' },
      { name: 'uploadPreset', label: 'Unsigned upload preset', placeholder: 'e.g. whoobe-mirror', help: 'Created once in Cloudinary and marked "unsigned"' },
    ],
  },
  {
    id: 'cloudflare-images',
    label: 'Cloudflare Images',
    description: 'Uploads the image to Cloudflare Images with an API token. The delivery URL is stable: the image id is the asset id.',
    fields: [
      { name: 'accountId', label: 'Account ID', required: true, placeholder: '32 hexadecimal characters', help: 'Cloudflare dashboard > Images, or the account overview' },
      { name: 'apiToken', label: 'API token', required: true, secret: true, help: 'A token with the permission "Cloudflare Images: Edit"; stored encrypted, never shown again' },
      { name: 'variant', label: 'Delivery variant', placeholder: 'public', help: 'The variant of Cloudflare Images the URL points to (default "public")' },
      { name: 'apiBase', label: 'API address (advanced)', placeholder: 'https://api.cloudflare.com/client/v4', help: 'Leave empty for Cloudflare. Only for a Cloudflare-compatible endpoint; the token is sent to it' },
    ],
  },
  {
    id: 'cdn-origin',
    label: 'CDN in front of this installation',
    description: 'Nothing is uploaded. Your CDN (a proxied Cloudflare hostname, CloudFront, Bunny ...) fetches the public files from this installation when it needs them and keeps them; Whoobe only writes the CDN address of each file, with the file\'s version so a replaced file is fetched again. Private files are not served.',
    fields: [
      { name: 'baseUrl', label: 'CDN address', required: true, placeholder: 'https://cdn.example.com', help: 'The hostname of the CDN. It must forward to the address of this installation, which serves the files under /dam-asset/' },
    ],
  },
];

export const cdnProviderIds = (): string[] => CDN_PROVIDERS.map((p) => p.id);
export const getCdnProvider = (id: string): CdnProviderInfo | undefined => CDN_PROVIDERS.find((p) => p.id === id);

const HEX32 = /^[0-9a-f]{32}$/i;
const VARIANT = /^[A-Za-z0-9_-]{1,99}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface CdnSettingsInput {
  provider?: unknown;
  config?: unknown;
  secrets?: unknown;
}

export type CdnSettingsValidation =
  | { ok: true; provider: string; config: Record<string, string>; secrets: Record<string, string> }
  | { ok: false; error: string };

/** Checks what the form sends: the provider is known, each field is of its kind. A blank secret means "keep the stored one" (returned as absent). */
export function validateCdnSettings(input: CdnSettingsInput, env: NodeJS.ProcessEnv = process.env): CdnSettingsValidation {
  const info = typeof input.provider === 'string' ? getCdnProvider(input.provider) : undefined;
  if (!info) return { ok: false, error: `provider must be one of: ${cdnProviderIds().join(', ')}` };
  const rawConfig = input.config && typeof input.config === 'object' && !Array.isArray(input.config) ? (input.config as Record<string, unknown>) : {};
  const rawSecrets = input.secrets && typeof input.secrets === 'object' && !Array.isArray(input.secrets) ? (input.secrets as Record<string, unknown>) : {};
  const config: Record<string, string> = {};
  const secrets: Record<string, string> = {};
  for (const f of info.fields) {
    const raw = (f.secret ? rawSecrets[f.name] : rawConfig[f.name]);
    if (raw !== undefined && typeof raw !== 'string') return { ok: false, error: `${f.name} must be text` };
    const v = (raw ?? '').trim();
    if (v.length > 500) return { ok: false, error: `${f.name} is too long` };
    if (!v) continue;
    (f.secret ? secrets : config)[f.name] = v;
  }
  if (info.id === 'cloudinary') {
    if (config.gatewayRouteId && !UUID.test(config.gatewayRouteId)) return { ok: false, error: 'gatewayRouteId must be a Gateway route id' };
  }
  if (info.id === 'cloudflare-images') {
    if (config.accountId && !HEX32.test(config.accountId)) return { ok: false, error: 'accountId must be 32 hexadecimal characters (the Cloudflare account id)' };
    if (config.variant && !VARIANT.test(config.variant)) return { ok: false, error: 'variant may contain letters, digits, - and _ (up to 99 characters)' };
    if (config.apiBase) {
      let u: URL | null = null;
      try { u = new URL(config.apiBase); } catch { /* refused below */ }
      const okScheme = u && (u.protocol === 'https:' || (u.protocol === 'http:' && env.CDN_ALLOW_HTTP === 'true'));
      if (!u || !okScheme || u.username || u.password || u.hash || u.search) return { ok: false, error: `apiBase must be an https address without credentials, query or fragment${env.CDN_ALLOW_HTTP === 'true' ? '' : ' (http needs CDN_ALLOW_HTTP=true on the server)'}` };
    }
  }
  if (info.id === 'cdn-origin' && config.baseUrl) {
    const clean = cleanOriginCdnBase(config.baseUrl, env);
    if (!clean) return { ok: false, error: `baseUrl must be the https address of the CDN, without credentials, query or fragment${env.CDN_ALLOW_HTTP === 'true' ? '' : ' (http needs CDN_ALLOW_HTTP=true on the server)'}` };
    config.baseUrl = clean;
  }
  return { ok: true, provider: info.id, config, secrets };
}

/** What is still missing for a provider to be usable (config + the secrets that are stored); [] = complete. */
export function missingCdnFields(provider: string, config: Record<string, string>, secretsSet: Record<string, boolean>): string[] {
  const info = getCdnProvider(provider);
  if (!info) return ['provider'];
  return info.fields.filter((f) => f.required && !(f.secret ? secretsSet[f.name] : config[f.name])).map((f) => f.name);
}

// ── Cloudflare Images ────────────────────────────────────────────────────────

export const CLOUDFLARE_API_BASE_DEFAULT = 'https://api.cloudflare.com/client/v4';
export const CLOUDFLARE_MAX_BYTES = 10 * 1024 * 1024;
const CLOUDFLARE_MIME = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml', 'image/avif']);

export const cloudflareApiBase = (env: NodeJS.ProcessEnv = process.env): string => (env.CDN_CLOUDFLARE_API_BASE?.trim() || CLOUDFLARE_API_BASE_DEFAULT).replace(/\/+$/, '');

/** Why an asset cannot go to Cloudflare Images, or null. */
export function cloudflareRefusal(mimeType: string, sizeBytes: number): string | null {
  if (!CLOUDFLARE_MIME.has(mimeType.toLowerCase())) return `Cloudflare Images takes PNG, JPEG, GIF, WebP, SVG and AVIF images, not ${mimeType}`;
  if (sizeBytes > CLOUDFLARE_MAX_BYTES) return `Cloudflare Images takes images up to 10 MB; this one is ${(sizeBytes / 1024 / 1024).toFixed(1)} MB`;
  return null;
}

export interface MultipartPart { name: string; value: string | Uint8Array; filename?: string; contentType?: string }

/** A multipart/form-data body, built by hand (the outbound guard takes bytes, not a FormData). */
export function buildMultipart(parts: MultipartPart[], boundary = `----whoobe${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`): { body: Buffer; contentType: string } {
  const chunks: Buffer[] = [];
  const esc = (v: string) => v.replace(/[\r\n"]/g, '_');
  for (const p of parts) {
    let head = `--${boundary}\r\nContent-Disposition: form-data; name="${esc(p.name)}"`;
    if (p.filename !== undefined) head += `; filename="${esc(p.filename)}"`;
    head += '\r\n';
    if (p.contentType) head += `Content-Type: ${p.contentType}\r\n`;
    head += '\r\n';
    chunks.push(Buffer.from(head), Buffer.isBuffer(p.value) ? p.value : typeof p.value === 'string' ? Buffer.from(p.value) : Buffer.from(p.value), Buffer.from('\r\n'));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return { body: Buffer.concat(chunks), contentType: `multipart/form-data; boundary=${boundary}` };
}

export interface CloudflareAnswer { success?: boolean; errors?: { code?: number; message?: string }[]; result?: { id?: string; variants?: string[] } }

/** The delivery URL for a variant out of the `variants` of an upload answer (they end in `/<variant>`); the first one when that variant is not listed. */
export function cloudflareDeliveryUrl(variants: string[] | undefined, variant: string): string | null {
  if (!variants?.length) return null;
  return variants.find((u) => u.endsWith(`/${variant}`)) ?? variants[0];
}

export function cloudflareErrorText(answer: CloudflareAnswer | null | undefined, status: number): string {
  const msg = answer?.errors?.map((e) => `${e.code ?? ''} ${e.message ?? ''}`.trim()).filter(Boolean).join('; ');
  return msg || `Cloudflare answered HTTP ${status}`;
}

/** Cloudflare's "already exists" for a custom image id (error 5409). */
export const cloudflareAlreadyExists = (status: number, answer: CloudflareAnswer | null | undefined): boolean =>
  status === 409 || !!answer?.errors?.some((e) => e.code === 5409);

export interface MirrorResult { url: string; providerAssetId?: string }

export interface CloudflareMirrorDeps {
  /** HTTP through the outbound guard. */
  fetch: (url: string, init: { method: string; headers: Record<string, string>; body?: Buffer }) => Promise<{ status: number; json: () => Promise<unknown> }>;
  apiBase?: string;
}

export interface CloudflareMirrorInput {
  accountId: string;
  apiToken: string;
  variant?: string;
  /** the asset id: the image id at Cloudflare, so the delivery URL is the same every time */
  assetId: string;
  filename: string;
  mimeType: string;
  bytes: Buffer;
}

/** Uploads one image to Cloudflare Images. An image that is already there (a second mirror of the same asset) is deleted and sent again. */
export async function mirrorToCloudflareImages(input: CloudflareMirrorInput, deps: CloudflareMirrorDeps): Promise<MirrorResult> {
  const refusal = cloudflareRefusal(input.mimeType, input.bytes.length);
  if (refusal) throw new CdnMirrorError(refusal, 415);
  const base = (deps.apiBase ?? cloudflareApiBase()).replace(/\/+$/, '');
  const account = encodeURIComponent(input.accountId);
  const auth = { Authorization: `Bearer ${input.apiToken}` };
  const upload = async () => {
    const { body, contentType } = buildMultipart([
      { name: 'id', value: input.assetId },
      { name: 'file', value: input.bytes, filename: input.filename || 'asset', contentType: input.mimeType },
    ]);
    const res = await deps.fetch(`${base}/accounts/${account}/images/v1`, { method: 'POST', headers: { ...auth, 'Content-Type': contentType }, body });
    return { status: res.status, answer: (await res.json().catch(() => null)) as CloudflareAnswer | null };
  };
  let { status, answer } = await upload();
  if (cloudflareAlreadyExists(status, answer)) {
    await deps.fetch(`${base}/accounts/${account}/images/v1/${encodeURIComponent(input.assetId)}`, { method: 'DELETE', headers: auth });
    ({ status, answer } = await upload());
  }
  if (status < 200 || status >= 300 || answer?.success === false) throw new CdnMirrorError(cloudflareErrorText(answer, status), 502, answer);
  const url = cloudflareDeliveryUrl(answer?.result?.variants, input.variant || 'public');
  if (!url) throw new CdnMirrorError('Cloudflare Images did not return a delivery URL', 502, answer);
  return { url, providerAssetId: answer?.result?.id ?? input.assetId };
}

/** Checks the account and the token with a read call (the statistics of Cloudflare Images). */
export async function testCloudflareImages(accountId: string, apiToken: string, deps: CloudflareMirrorDeps): Promise<{ ok: true } | { ok: false; error: string }> {
  const base = (deps.apiBase ?? cloudflareApiBase()).replace(/\/+$/, '');
  try {
    const res = await deps.fetch(`${base}/accounts/${encodeURIComponent(accountId)}/images/v1/stats`, { method: 'GET', headers: { Authorization: `Bearer ${apiToken}` } });
    const answer = (await res.json().catch(() => null)) as CloudflareAnswer | null;
    if (res.status >= 200 && res.status < 300 && answer?.success !== false) return { ok: true };
    return { ok: false, error: cloudflareErrorText(answer, res.status) };
  } catch (e) {
    return { ok: false, error: `Cloudflare could not be reached: ${(e as Error).message}` };
  }
}

// ── CDN in front of this installation (pull CDN) ─────────────────────────────

/** The CDN address as it is stored: https (http only with CDN_ALLOW_HTTP), no credentials, query or fragment, no trailing slash; null when it is not acceptable. */
export function cleanOriginCdnBase(value: string, env: NodeJS.ProcessEnv = process.env): string | null {
  let u: URL;
  try { u = new URL(value); } catch { return null; }
  const okScheme = u.protocol === 'https:' || (u.protocol === 'http:' && env.CDN_ALLOW_HTTP === 'true');
  if (!okScheme || u.username || u.password || u.hash || u.search) return null;
  return `${u.origin}${u.pathname}`.replace(/\/+$/, '');
}

/** The URL of a stored file through the CDN: the path the installation serves public files under, plus the file's version (the origin sends them as immutable for a year, so a new version needs a new URL). */
export function originCdnUrl(baseUrl: string, s3Key: string, version: number): string {
  const path = s3Key.split('/').map(encodeURIComponent).join('/');
  return `${baseUrl.replace(/\/+$/, '')}/dam-asset/${path}?v=${version}`;
}

/** The same CDN URL for a newer version of the file (a re-upload): only `v=` changes. The origin sends files as immutable for a year, so without this a replaced file would be served stale. */
export function withOriginCdnVersion(url: string, version: number): string {
  return /([?&])v=\d+/.test(url) ? url.replace(/([?&])v=\d+/, `$1v=${version}`) : `${url}${url.includes('?') ? '&' : '?'}v=${version}`;
}

export interface OriginCdnProbe {
  /** A HEAD request through the outbound guard. */
  head: (url: string) => Promise<{ status: number; contentType: string | null }>;
}

export interface OriginCdnAsset { s3Key: string; version: number; mimeType: string; isPublic: boolean }

const baseType = (v: string | null): string => (v ?? '').split(';')[0].trim().toLowerCase();

/** Asks the CDN for the file and says what is wrong when the answer is not the file: not found (the hostname does not forward to this installation),
 *  a web page instead of the file (it forwards to the dashboard, which answers every unknown path with the app), or an error. null = fine. */
export async function checkOriginCdn(url: string, asset: OriginCdnAsset, probe: OriginCdnProbe): Promise<string | null> {
  let answer: { status: number; contentType: string | null };
  try { answer = await probe.head(url); } catch (e) { return `The CDN could not be reached: ${(e as Error).message}`; }
  if (answer.status === 404) return 'The CDN answered 404 for this file: the hostname does not forward /dam-asset/ to this installation, or it points to another origin';
  if (answer.status < 200 || answer.status >= 300) return `The CDN answered HTTP ${answer.status} for this file`;
  if (baseType(answer.contentType) === 'text/html' && baseType(asset.mimeType) !== 'text/html') return 'The CDN returned a web page instead of the file: the hostname forwards to the dashboard, not to the asset service (route /dam-asset/ to this installation)';
  return null;
}

/** "Mirrors" a public file at a CDN that fetches from this installation: nothing is sent, the URL is built and the CDN is asked once to confirm it serves the file. */
export async function mirrorViaOriginCdn(baseUrl: string, asset: OriginCdnAsset, probe: OriginCdnProbe): Promise<MirrorResult> {
  if (!asset.isPublic) throw new CdnMirrorError('This file is private: a CDN in front of this installation can only serve public files (move it to a public folder first)', 400);
  const url = originCdnUrl(baseUrl, asset.s3Key, asset.version);
  const problem = await checkOriginCdn(url, asset, probe);
  if (problem) throw new CdnMirrorError(problem, 502);
  return { url };
}

/** The settings test of this provider: with a public file as the sample, the same check as a mirror; without one, only that the hostname answers. */
export async function testOriginCdn(baseUrl: string, sample: OriginCdnAsset | null, probe: OriginCdnProbe): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!sample) return { ok: false, error: 'There is no public file to test with: upload one into a public folder, then test again' };
  const problem = await checkOriginCdn(originCdnUrl(baseUrl, sample.s3Key, sample.version), sample, probe);
  return problem ? { ok: false, error: problem } : { ok: true };
}

export class CdnMirrorError extends Error {
  constructor(message: string, public readonly status: number = 502, public readonly detail?: unknown) { super(message); }
}
