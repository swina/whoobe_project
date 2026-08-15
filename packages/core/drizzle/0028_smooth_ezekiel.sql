CREATE TABLE IF NOT EXISTS "website_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"website_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"layout" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"path_patterns" text[] DEFAULT '{}' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "whoobe_pages" ADD COLUMN "kind" text DEFAULT 'content' NOT NULL;