DROP TABLE IF EXISTS "ai_settings" CASCADE;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ai_settings" (
  "user_id" uuid PRIMARY KEY NOT NULL,
  "provider" text DEFAULT 'openai' NOT NULL,
  "model" text DEFAULT 'gpt-4o-mini' NOT NULL,
  "endpoint" text,
  "api_key" text,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "ai_settings" ADD CONSTRAINT "ai_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade;