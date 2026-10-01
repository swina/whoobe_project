ALTER TABLE "whoobe_pages" ADD COLUMN IF NOT EXISTS "thumbnail" text;
--> statement-breakpoint
ALTER TABLE "whoobe_one_snippets" ADD COLUMN IF NOT EXISTS "thumbnail" text;
