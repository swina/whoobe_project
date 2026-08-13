CREATE TABLE IF NOT EXISTS "mail_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"host" text NOT NULL,
	"port" integer NOT NULL,
	"secure" boolean DEFAULT false NOT NULL,
	"user" text,
	"password" text,
	"from_address" text NOT NULL,
	"from_name" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
