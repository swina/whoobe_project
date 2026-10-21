-- A snippet can stand for a block of the Generate Website Wizard (hero, banner, cta, ...), so the wizard lists it with its default blocks.
-- Expand-only: a new nullable column.
ALTER TABLE "whoobe_one_snippets" ADD COLUMN IF NOT EXISTS "wizard_block" text;
