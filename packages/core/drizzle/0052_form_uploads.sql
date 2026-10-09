-- Files visitors send through a form's Upload field: one row per approved intent, staged in private storage until the form is
-- submitted. Expand-only: a new table.
CREATE TABLE IF NOT EXISTS "form_uploads" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "website_id" uuid NOT NULL,
  "form_ref" text NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "extension" text NOT NULL,
  "original_name" text NOT NULL,
  "declared_size" bigint NOT NULL,
  "size" bigint,
  "s3_key" text,
  "asset_id" uuid,
  "submission_id" uuid,
  "rejected_reason" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "attached_at" timestamp with time zone
);
CREATE INDEX IF NOT EXISTS "form_uploads_website_created" ON "form_uploads" ("website_id", "created_at");
CREATE INDEX IF NOT EXISTS "form_uploads_status_created" ON "form_uploads" ("status", "created_at");
