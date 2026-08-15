ALTER TABLE "mail_settings" ADD COLUMN "bcc_from_address" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "mail_templates" ADD COLUMN "bcc" text;