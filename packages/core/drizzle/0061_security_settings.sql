-- Security settings (docs/plans/system/mandatory-2fa-plan.md). Expand-only: one new single-row table.
-- No row = the defaults of the code (nobody must use a second factor, minimum password length 8).
CREATE TABLE IF NOT EXISTS "security_settings" (
  "id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
  "require_mfa_role_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
  "password_min_length" integer DEFAULT 8 NOT NULL,
  "password_require_classes" boolean DEFAULT false NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "security_settings_single_row" CHECK ("id" = 1),
  CONSTRAINT "security_settings_min_length" CHECK ("password_min_length" BETWEEN 8 AND 128)
);
