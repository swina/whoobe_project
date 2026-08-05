CREATE TABLE IF NOT EXISTS "migration_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"label" text NOT NULL,
	"db_host" text NOT NULL,
	"db_port" integer DEFAULT 3306 NOT NULL,
	"db_user" text NOT NULL,
	"db_password_encrypted" text NOT NULL,
	"db_name" text NOT NULL,
	"classes_path" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
