-- Kits: where a kit comes from and which version it is (docs/plans/kits/kit-library-plan.md). Expand-only: four new columns on whoobe_one_kits.
-- origin: 'bundled' = shipped with the distribution (read-only, refreshed by the seed when `version` goes up), 'user' = made by a person (editable),
-- 'catalogue' = installed from a remote catalogue (later; read-only like bundled). `slug` is the stable identity of a bundled/catalogue kit (the name may be
-- translated or edited); `forked_from` is the kit a user copy was made from. Every row that exists today is 'user': the kits seeded before this
-- migration cannot be told from kits somebody made, and nothing is deleted.
ALTER TABLE "whoobe_one_kits" ADD COLUMN IF NOT EXISTS "origin" text DEFAULT 'user' NOT NULL;
ALTER TABLE "whoobe_one_kits" ADD COLUMN IF NOT EXISTS "version" text DEFAULT '1' NOT NULL;
ALTER TABLE "whoobe_one_kits" ADD COLUMN IF NOT EXISTS "slug" text;
ALTER TABLE "whoobe_one_kits" ADD COLUMN IF NOT EXISTS "forked_from" uuid REFERENCES "whoobe_one_kits"("id") ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "whoobe_one_kits_slug_idx" ON "whoobe_one_kits" ("slug") WHERE "slug" IS NOT NULL;
