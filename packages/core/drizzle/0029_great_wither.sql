CREATE TABLE IF NOT EXISTS "whoobe_pages_staging" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"translation_group_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"locale" text DEFAULT 'en' NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"category" text DEFAULT '' NOT NULL,
	"kind" text DEFAULT 'content' NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"workflow_state" text,
	"content" jsonb NOT NULL,
	"seo" jsonb,
	"sitemap" jsonb,
	"search" jsonb,
	"pimcore_id" text,
	"path" text,
	"website_id" uuid,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"staged_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "whoobe_pages_staging_locale_slug_idx" ON "whoobe_pages_staging" USING btree ("locale","slug");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "whoobe_pages_staging_translation_group_locale_idx" ON "whoobe_pages_staging" USING btree ("translation_group_id","locale");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "whoobe_pages_staging_pimcore_id_idx" ON "whoobe_pages_staging" USING btree ("pimcore_id");