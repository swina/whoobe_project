// CDN mirroring (docs/plans/assets/assets-cdn.md): an asset can be pushed
// to an external image CDN (Cloudinary first, others via the same Gateway
// preset mechanism) so consumers that can't reach this install's own DAM
// directly (a local/VPN-only deployment, an ESP's servers building an
// email campaign) get a stable, permanent, publicly-reachable URL instead
// of a local-only one or an embedded base64 copy.
//
// Pure types only, deliberately kept dependency-free so this is safe to
// import from both the browser (admin-dashboard, via the root package
// entry) and Node server code (asset-processor/core-api, via
// asset-records.ts) - same reasoning as ExtractedAssetMetadata in
// metadata-extractor.ts.

/** One provider's mirror of a given asset. Keyed by provider id on
 *  AssetRecord.cdnMirrors (a Record<string, CdnMirrorRecord>, not a single
 *  field) so an asset mirrored to more than one provider over time keeps
 *  its history instead of overwriting silently. */
export interface CdnMirrorRecord {
  /** Matches the Gateway preset id used to create the mirror, e.g. 'cloudinary'. */
  provider: string
  /** Stable, permanent delivery URL - safe to use anywhere, never expires
   *  (unlike a presigned S3 URL for a private asset). */
  url: string
  /** The provider's own reference for this upload (Cloudinary's
   *  `public_id`, or the equivalent for another provider) - needed to
   *  delete/replace the mirror later. */
  providerAssetId?: string
  /** ISO timestamp of when this mirror was created/last refreshed. */
  mirroredAt: string
  /** Size in bytes of what was actually uploaded (post-resize, if the
   *  source had to be re-encoded before sending - see image-reencode.ts). */
  bytesSent: number
}
