-- Palettes of the Generate Website Wizard made by a person (the four built-in ones live in the code and are not rows). Expand-only: one new table.
-- `colors` holds the eight roles of a palette (bg, bgAlt, card, text, muted, border, accent, onAccent) as #RRGGBB.
CREATE TABLE IF NOT EXISTS "wizard_palettes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "colors" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "wizard_palettes_name_idx" ON "wizard_palettes" (lower("name"));
