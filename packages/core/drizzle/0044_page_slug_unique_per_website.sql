DROP INDEX IF EXISTS "whoobe_pages_locale_slug_idx";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "whoobe_pages_website_locale_slug_idx" ON "whoobe_pages" ("website_id","locale","slug");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "whoobe_pages_no_website_locale_slug_idx" ON "whoobe_pages" ("locale","slug") WHERE "website_id" IS NULL;--> statement-breakpoint
DROP INDEX IF EXISTS "whoobe_pages_staging_locale_slug_idx";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "whoobe_pages_staging_website_locale_slug_idx" ON "whoobe_pages_staging" ("website_id","locale","slug");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "whoobe_pages_staging_no_website_locale_slug_idx" ON "whoobe_pages_staging" ("locale","slug") WHERE "website_id" IS NULL;
