CREATE TABLE IF NOT EXISTS "ai_image_settings" (
  "user_id" uuid PRIMARY KEY NOT NULL,
  "provider" text DEFAULT 'openai' NOT NULL,
  "model" text DEFAULT 'dall-e-3' NOT NULL,
  "endpoint" text,
  "api_key" text,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "ai_image_settings" ADD CONSTRAINT "ai_image_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade;