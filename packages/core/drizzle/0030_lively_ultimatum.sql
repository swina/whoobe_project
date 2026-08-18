CREATE TABLE IF NOT EXISTS "themes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"colors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"fonts" text[] DEFAULT '{}' NOT NULL,
	"styles" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "whoobe_one_snippets" ADD COLUMN "theme_id" uuid;--> statement-breakpoint
ALTER TABLE "whoobe_pages" ADD COLUMN "theme_id" uuid;--> statement-breakpoint
ALTER TABLE "websites" ADD COLUMN "theme_id" uuid;