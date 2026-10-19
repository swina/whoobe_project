import { formatS3ObjectKey } from './storage.js';
import { getAssetById, getAssetByPath } from '../db/asset-records.js';
import type { CdnMirrorRecord } from './cdn-mirror.js';

// Shared DAM image-reference resolution (docs/plans/assets/assets-cdn.md).
// Originally lived only in mail/mail-image-urls.ts (email rendering); moved
// here, generic and non-mail-specific, so publish/public-page serving
// (apps/core-api/src/server.ts) can resolve the same references to their
// CDN mirror without duplicating the walk/lookup logic. mail-image-urls.ts
// now imports from here instead of owning its own copy.
//
// The editor stores a *stable reference*, never a resolved URL: a
// Pimcore-style path (e.g. "/uploads/marketing/hero.jpg") or an asset-record
// UUID when referenced from a data object field.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True when a string is a DAM reference (raw Pimcore path or asset UUID)
 *  rather than an already-resolved http(s)/data: URL. */
export function looksLikeDamReference(value: string): boolean {
  return (value.startsWith('/') && !value.startsWith('//')) || UUID_RE.test(value);
}

export function damPathToProxyUrl(pimcorePath: string): string {
  const publicBaseUrl = (process.env.S3_PUBLIC_BASE_URL ?? '').replace(/\/+$/, '');
  if (!publicBaseUrl) return '';
  const keyPrefix = process.env.S3_KEY_PREFIX ?? '';
  return `${publicBaseUrl}/${formatS3ObjectKey(pimcorePath, keyPrefix)}`;
}

/** Picks a mirror to use when an asset has more than one provider mirrored. Websites may use different CDNs for one shared asset
 *  (docs/plans/assets/cdn-providers-plan.md), so the provider of the website being served wins (`prefer`); without one, or when the asset has no
 *  mirror there, whichever entry comes first. */
export function pickCdnMirrorUrl(mirrors: Record<string, CdnMirrorRecord> | null | undefined, prefer?: string | null): string | null {
  if (!mirrors) return null;
  if (prefer && mirrors[prefer]?.url) return mirrors[prefer].url;
  const first = Object.values(mirrors)[0];
  return first?.url ?? null;
}

export interface ResolvedImageRef {
  url: string;
  /** True when `url` is already a CDN mirror - callers that would
   *  otherwise base64-embed the image can skip that entirely, since a
   *  mirror URL is already stable and publicly reachable on its own. */
  isCdnMirror: boolean;
}

export async function resolveImageRef(ref: string, preferProvider?: string | null): Promise<ResolvedImageRef | null> {
  const record = UUID_RE.test(ref) ? await getAssetById(ref) : await getAssetByPath(ref);
  const cdnUrl = pickCdnMirrorUrl(record?.cdnMirrors, preferProvider);
  if (cdnUrl) return { url: cdnUrl, isCdnMirror: true };

  const path = UUID_RE.test(ref) ? record?.pimcorePath ?? null : ref;
  if (!path) return null;
  const url = damPathToProxyUrl(path);
  return url ? { url, isCdnMirror: false } : null;
}

/** Walks an Element tree and collects every DAM image reference
 *  (`node.image.url`, recursing into `node.blocks`). */
export function collectImageRefs(content: unknown): Set<string> {
  const refs = new Set<string>();
  const walk = (node: any): void => {
    if (!node || typeof node !== 'object') return;
    const url = node.image?.url;
    if (typeof url === 'string' && looksLikeDamReference(url)) refs.add(url);
    if (Array.isArray(node.blocks)) node.blocks.forEach(walk);
  };
  walk(content);
  return refs;
}

/** Walks an Element tree and resolves every DAM image reference that has an
 *  actual CDN mirror to its stable public URL - references with no mirror
 *  (or no asset record) are left out entirely, unlike resolveMailImageUrls()
 *  which also falls back to the DAM proxy URL for those. Consumers of this
 *  map (packages/sdk/renderer's resolveImageUrl) already know how to fall
 *  back to the proxy URL themselves given an assetBaseUrl, so this only
 *  needs to carry the subset that overrides that default. */
export async function resolveContentCdnMirrors(content: unknown, preferProvider?: string | null): Promise<Record<string, string>> {
  const refs = collectImageRefs(content);
  const map: Record<string, string> = {};
  await Promise.all(
    [...refs].map(async (ref) => {
      try {
        const resolved = await resolveImageRef(ref, preferProvider);
        if (resolved?.isCdnMirror) map[ref] = resolved.url;
      } catch {
        // Leave unresolved - caller falls back to its own default resolution.
      }
    }),
  );
  return map;
}
