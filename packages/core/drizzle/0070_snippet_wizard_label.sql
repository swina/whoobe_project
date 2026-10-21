-- The name under which the Generate Website Wizard lists a snippet that stands for a block (its own name when null).
-- Expand-only: a new nullable column.
ALTER TABLE "whoobe_one_snippets" ADD COLUMN IF NOT EXISTS "wizard_label" text;
