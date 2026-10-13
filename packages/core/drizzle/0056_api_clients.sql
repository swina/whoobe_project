-- Applications that call Whoobe with a key (docs/plans/api-gateway/client-access-hub.md). Expand-only: two new tables.
CREATE TABLE IF NOT EXISTS "api_clients" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "kind" text DEFAULT 'server' NOT NULL,
  "status" text DEFAULT 'active' NOT NULL,
  "scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "rate_limit_rps" integer DEFAULT 10 NOT NULL,
  "daily_quota" integer,
  "allowed_ips" text[],
  "expires_at" timestamp with time zone,
  "created_by" uuid,
  "last_used_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "api_client_name_idx" ON "api_clients" ("name");
CREATE TABLE IF NOT EXISTS "api_client_keys" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "client_id" uuid NOT NULL REFERENCES "api_clients"("id") ON DELETE CASCADE,
  "prefix" text NOT NULL,
  "key_hash" text NOT NULL,
  "label" text DEFAULT '' NOT NULL,
  "expires_at" timestamp with time zone,
  "revoked_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "api_client_key_prefix_idx" ON "api_client_keys" ("prefix");
CREATE INDEX IF NOT EXISTS "api_client_key_client_idx" ON "api_client_keys" ("client_id");
