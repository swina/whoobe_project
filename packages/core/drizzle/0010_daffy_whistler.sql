CREATE TABLE IF NOT EXISTS "data_object_preview_tokens" (
	"token" text PRIMARY KEY NOT NULL,
	"object_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"view_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "data_object_preview_tokens" ADD CONSTRAINT "data_object_preview_tokens_object_id_data_objects_id_fk" FOREIGN KEY ("object_id") REFERENCES "public"."data_objects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
