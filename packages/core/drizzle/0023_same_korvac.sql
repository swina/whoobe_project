CREATE TABLE IF NOT EXISTS "mail_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"to" text NOT NULL,
	"from" text,
	"cc" text,
	"subject" text NOT NULL,
	"status" text NOT NULL,
	"error" text,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
