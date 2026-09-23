CREATE TABLE IF NOT EXISTS "ai_translate_settings" (
  "user_id" uuid PRIMARY KEY NOT NULL,
  "provider" text DEFAULT 'openai' NOT NULL,
  "model" text DEFAULT 'gpt-4o-mini' NOT NULL,
  "endpoint" text,
  "api_key" text,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "ai_translate_settings" ADD CONSTRAINT "ai_translate_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade;
