CREATE TABLE IF NOT EXISTS "ai_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text DEFAULT 'openai' NOT NULL,
	"model" text DEFAULT 'gpt-4o-mini' NOT NULL,
	"endpoint" text,
	"api_key" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "whoobe_ai_generated" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"prompt" text NOT NULL,
	"provider" text,
	"model" text,
	"payload" jsonb,
	"raw_response" jsonb,
	"status" text DEFAULT 'success' NOT NULL,
	"error" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
