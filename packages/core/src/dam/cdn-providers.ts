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
export function validateCdnSettings(input: CdnSettingsInput): CdnSettingsValidation {
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

export class CdnMirrorError extends Error {
  constructor(message: string, public readonly status: number = 502, public readonly detail?: unknown) { super(message); }
}
