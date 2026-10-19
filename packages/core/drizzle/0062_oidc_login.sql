-- OIDC login for staff (docs/plans/system/oidc-login-plan.md). Expand-only: two new tables.
-- oidc_settings: one row (id = 1) holding the one provider of the installation; no row = single sign-on is off.
-- user_identities: which person at which provider is which Whoobe user, by (issuer, subject) - never by e-mail alone.
CREATE TABLE IF NOT EXISTS "oidc_settings" (
  "id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
  "enabled" boolean DEFAULT false NOT NULL,
  "label" text DEFAULT 'Single sign-on' NOT NULL,
  "issuer" text,
  "client_id" text,
  "client_secret_encrypted" text,
  "redirect_base_url" text,
  "scopes" text DEFAULT 'openid email profile' NOT NULL,
  "role_claim" text,
  "role_mapping" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "default_role_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
  "auto_provision" boolean DEFAULT false NOT NULL,
  "link_by_email" boolean DEFAULT true NOT NULL,
  "local_login" text DEFAULT 'all' NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "oidc_settings_single_row" CHECK ("id" = 1),
  CONSTRAINT "oidc_settings_local_login" CHECK ("local_login" IN ('all', 'admins'))
);
CREATE TABLE IF NOT EXISTS "user_identities" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "issuer" text NOT NULL,
  "subject" text NOT NULL,
  "email" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_login_at" timestamp with time zone
);
CREATE UNIQUE INDEX IF NOT EXISTS "user_identities_issuer_subject_idx" ON "user_identities" ("issuer", "subject");
CREATE INDEX IF NOT EXISTS "user_identities_user_idx" ON "user_identities" ("user_id");
