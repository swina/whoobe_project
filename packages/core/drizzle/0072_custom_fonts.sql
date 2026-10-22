-- Web fonts uploaded to the DAM and shared by the websites of the workspace. Expand-only: one new table.
-- One row is one face (family, weight, style) bound to a woff2 asset by its path; `asset_path` is not a foreign key, an asset can be moved or deleted
-- and the API refuses a font whose asset is gone when it is listed for use.
CREATE TABLE IF NOT EXISTS "custom_fonts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "family" text NOT NULL,
  "weight" integer DEFAULT 400 NOT NULL,
  "style" text DEFAULT 'normal' NOT NULL,
  "asset_path" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "custom_fonts_face_idx" ON "custom_fonts" (lower("family"), "weight", "style");
