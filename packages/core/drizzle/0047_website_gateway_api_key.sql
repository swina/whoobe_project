ALTER TABLE "websites" ADD COLUMN IF NOT EXISTS "gateway_api_key_hash" text;
ALTER TABLE "websites" ADD COLUMN IF NOT EXISTS "gateway_api_key_prefix" text;
