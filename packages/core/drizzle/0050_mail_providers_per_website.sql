-- Outgoing mail: a configuration per website (the existing row stays the installation's default), HTTP mail providers
-- next to SMTP, secrets encrypted at rest. Expand step only: the plaintext `password` column stays until every
-- environment has been through the startup backfill (db/scripts/backfill-mail-settings-encryption.ts); a later
-- migration drops it.
ALTER TABLE "mail_settings" ADD COLUMN IF NOT EXISTS "website_id" uuid;
--> statement-breakpoint
ALTER TABLE "mail_settings" ADD COLUMN IF NOT EXISTS "provider" text NOT NULL DEFAULT 'smtp';
--> statement-breakpoint
ALTER TABLE "mail_settings" ADD COLUMN IF NOT EXISTS "password_encrypted" text;
--> statement-breakpoint
ALTER TABLE "mail_settings" ADD COLUMN IF NOT EXISTS "provider_config_encrypted" text;
--> statement-breakpoint
-- a provider row has no SMTP host/port, and may leave the sender to the provider's own dashboard settings
ALTER TABLE "mail_settings" ALTER COLUMN "host" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "mail_settings" ALTER COLUMN "port" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "mail_settings" ALTER COLUMN "from_address" DROP NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "mail_settings_website_idx" ON "mail_settings" ("website_id") WHERE "website_id" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "mail_log" ADD COLUMN IF NOT EXISTS "provider" text;
--> statement-breakpoint
ALTER TABLE "mail_log" ADD COLUMN IF NOT EXISTS "reference" text;
--> statement-breakpoint
ALTER TABLE "mail_log" ADD COLUMN IF NOT EXISTS "website_id" uuid;
