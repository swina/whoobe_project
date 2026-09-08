CREATE TABLE IF NOT EXISTS "figma_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"access_token" text,
	"team_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "websites" ADD COLUMN "root_path" text DEFAULT '' NOT NULL;--> statement-breakpoint
UPDATE "websites" SET "root_path" = regexp_replace(lower(trim("name")), '[^a-z0-9]+', '-', 'g') WHERE "root_path" = '';--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "root_path_idx" ON "websites" USING btree ("root_path");