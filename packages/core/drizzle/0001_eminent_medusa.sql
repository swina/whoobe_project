CREATE TABLE IF NOT EXISTS "assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pimcore_path" text NOT NULL,
	"filename" text NOT NULL,
	"folder_path" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"mime_type" text NOT NULL,
	"file_type" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"s3_key" text NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"metadata" jsonb,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assets_pimcore_path_unique" UNIQUE("pimcore_path")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "folders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"path" text NOT NULL,
	"name" text NOT NULL,
	"parent_path" text NOT NULL,
	"is_public" boolean,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "folders_path_unique" UNIQUE("path")
);
