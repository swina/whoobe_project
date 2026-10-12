-- A queued publish job may carry the gateway site key until a runner claims it. Expand-only: a nullable column.
ALTER TABLE "publish_jobs" ADD COLUMN IF NOT EXISTS "site_key_enc" text;
