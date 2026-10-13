// What an API client sees of a DAM asset (docs/plans/api-gateway/client-access-hub.md, phase 3 "assets"). Pure functions, no I/O.
// A data object stores an asset as `{ assetId }`; the client gets the file's own facts and two ways to reach it, nothing about how the
// workspace stores it (no S3 key, no bucket, no internal path).
//   url         an address that needs no credential: the CDN mirror when there is one, otherwise the public address of a public asset
//               (null when neither exists: a private asset, or a workspace without a public address for its files)
//   contentPath the gateway's own path that streams the file with the client's credential; always present
// The record keeps the logical path (`pimcorePath`); only the folder and the file name are shown.

import type { ClassFieldDefinition } from '../schema/dynamic.js';
import { assetScopeAllows } from './client-scopes.js';

export interface ClientAssetSource {
  id: string;
  filename: string;
  folderPath: string;
  mimeType: string;
  fileType: string;
  sizeBytes: number;
  version: number;
  isPublic: boolean;
  pimcorePath: string;
  s3Key: string;
  updatedAt: Date | string;
  metadata?: { technical?: { width?: number; height?: number } } | null;
  cdnMirrors?: Record<string, { url?: string } | undefined> | null;
}

export interface ClientAsset {
  id: string;
  filename: string;
  folder: string;
  mimeType: string;
  type: string;
  size: number;
  width?: number;
  height?: number;
  updatedAt: Date | string;
  url: string | null;
  contentPath: string;
}

/** `publicUrlOf`: the public address of a public asset, or null when the workspace has none. */
export function projectClientAsset(a: ClientAssetSource, publicUrlOf: (a: ClientAssetSource) => string | null): ClientAsset {
  const mirror = Object.values(a.cdnMirrors ?? {}).find((m) => typeof m?.url === 'string' && m.url.startsWith('https://'))?.url;
  const meta = a.metadata?.technical ?? {};
  return {
    id: a.id, filename: a.filename, folder: a.folderPath, mimeType: a.mimeType, type: a.fileType, size: a.sizeBytes,
    ...(typeof meta.width === 'number' ? { width: meta.width } : {}),
    ...(typeof meta.height === 'number' ? { height: meta.height } : {}),
    updatedAt: a.updatedAt,
    url: mirror ?? (a.isPublic ? publicUrlOf(a) : null),
    contentPath: `/client/v1/assets/${a.id}/content`,
  };
}

const ASSET_FIELD_TYPES = new Set(['image', 'asset', 'video', 'manyToOneRelation']);
/** A many-to-one field with a target class points to a data object, not to an asset. */
const isAssetField = (f: ClassFieldDefinition): boolean => ASSET_FIELD_TYPES.has(f.fieldType) && !(f.fieldType === 'manyToOneRelation' && f.relationTarget);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const CLIENT_ASSET_MAX_EXPAND = 200;

/** Every `{ assetId }` of the attributes whose field is an image or asset field (also inside a list of them), in order of appearance. */
export function collectAssetRefs(attributes: Record<string, unknown>, fields: readonly ClassFieldDefinition[]): string[] {
  const ids: string[] = [];
  const take = (v: unknown): void => {
    if (Array.isArray(v)) { v.forEach(take); return; }
    const id = v && typeof v === 'object' ? (v as { assetId?: unknown }).assetId : undefined;
    if (typeof id === 'string' && UUID.test(id) && !ids.includes(id)) ids.push(id);
  };
  for (const f of fields) {
    if (isAssetField(f)) take(attributes[f.name]);
  }
  return ids;
}

/**
 * Adds the asset's facts and addresses next to each `{ assetId }`, only for assets whose folder the client's scopes allow; any other
 * reference stays as it was (just the id), so the data does not tell a client that a file it may not read exists or what it is called.
 */
export function expandAssetRefs(
  attributes: Record<string, unknown>, fields: readonly ClassFieldDefinition[], scopes: readonly string[],
  assets: ReadonlyMap<string, ClientAsset>,
): Record<string, unknown> {
  const expand = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(expand);
    const id = v && typeof v === 'object' ? (v as { assetId?: unknown }).assetId : undefined;
    const asset = typeof id === 'string' ? assets.get(id) : undefined;
    return asset && assetScopeAllows(scopes, 'read', asset.folder) ? { ...(v as object), asset } : v;
  };
  const out: Record<string, unknown> = { ...attributes };
  for (const f of fields) {
    if (isAssetField(f) && f.name in out) out[f.name] = expand(out[f.name]);
  }
  return out;
}
