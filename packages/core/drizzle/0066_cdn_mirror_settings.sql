-- CDN mirroring settings per website (docs/plans/assets/cdn-providers-plan.md). Expand-only: one new table.
-- website_id NULL = the installation's default; one row per website at most. `config` holds what is not secret, `secrets_encrypted` the credentials
-- (encrypted with INTEGRATION_SECRETS_ENCRYPTION_KEY when it is set). An installation that already had a CDN mirror setting (kept until now in the
-- `settings` of its first website) gets it as the default row; the old key is left where it is and no longer read.
CREATE TABLE IF NOT EXISTS "cdn_mirror_settings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "website_id" uuid REFERENCES "websites"("id") ON DELETE CASCADE,
  "provider" text DEFAULT 'cloudinary' NOT NULL,
  "config" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "secrets_encrypted" text,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "cdn_mirror_settings_website_idx" ON "cdn_mirror_settings" ("website_id") WHERE "website_id" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "cdn_mirror_settings_default_idx" ON "cdn_mirror_settings" ((true)) WHERE "website_id" IS NULL;
INSERT INTO "cdn_mirror_settings" ("website_id", "provider", "config")
SELECT NULL,
       COALESCE(NULLIF(w."settings"->'cdnMirror'->>'provider', ''), 'cloudinary'),
       jsonb_strip_nulls(jsonb_build_object(
         'gatewayRouteId', NULLIF(w."settings"->'cdnMirror'->>'gatewayRouteId', ''),
         'uploadPreset', NULLIF(w."settings"->'cdnMirror'->>'uploadPreset', '')))
FROM "websites" w
WHERE w."settings" ? 'cdnMirror' AND jsonb_typeof(w."settings"->'cdnMirror') = 'object'
ORDER BY w."created_at" DESC
LIMIT 1
ON CONFLICT DO NOTHING;
