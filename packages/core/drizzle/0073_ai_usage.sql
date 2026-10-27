-- Token usage of the AI functions per user (docs/plans/ai/ai-usage-plan.md). Expand-only: two new tables and three
-- new columns of security_settings. Nothing is written until an administrator turns the tracking on.
CREATE TABLE IF NOT EXISTS "ai_usage" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "kind" text NOT NULL,
  "provider" text,
  "model" text,
  "calls" integer NOT NULL,
  "input_tokens" integer,
  "output_tokens" integer,
  "status" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "ai_usage_created_idx" ON "ai_usage" ("created_at");
CREATE INDEX IF NOT EXISTS "ai_usage_user_created_idx" ON "ai_usage" ("user_id", "created_at");
CREATE TABLE IF NOT EXISTS "ai_usage_monthly" (
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "month" date NOT NULL,
  "kind" text NOT NULL,
  "provider" text NOT NULL,
  "model" text NOT NULL,
  "requests" integer NOT NULL,
  "calls" integer NOT NULL,
  "input_tokens" bigint NOT NULL,
  "output_tokens" bigint NOT NULL,
  PRIMARY KEY ("user_id", "month", "kind", "provider", "model")
);
ALTER TABLE "security_settings" ADD COLUMN IF NOT EXISTS "ai_usage_tracking" boolean DEFAULT false NOT NULL;
ALTER TABLE "security_settings" ADD COLUMN IF NOT EXISTS "ai_usage_retention_days" integer DEFAULT 90;
ALTER TABLE "security_settings" ADD COLUMN IF NOT EXISTS "ai_generated_retention_days" integer;
