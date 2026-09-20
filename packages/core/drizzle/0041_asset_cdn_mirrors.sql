-- Asset CDN mirroring (docs/plans/assets/assets-cdn.md): tracks, per
-- provider, a stable/permanent external delivery URL for an asset (e.g.
-- Cloudinary's secure_url) - a deliberate exception to this table's own
-- "never store URLs" convention (see dam-schema.ts's header comment),
-- since a CDN mirror URL doesn't expire the way a presigned S3 URL does.
-- Keyed by provider id so mirroring to a second provider later doesn't
-- clobber the first's record.
ALTER TABLE assets ADD COLUMN IF NOT EXISTS cdn_mirrors jsonb NOT NULL DEFAULT '{}'::jsonb;
