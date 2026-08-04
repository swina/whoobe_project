CREATE TABLE IF NOT EXISTS "data_classes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"label" text NOT NULL,
	"fields" jsonb NOT NULL,
	"pimcore_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "data_classes_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "data_objects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"class_id" uuid NOT NULL,
	"key" text NOT NULL,
	"path" text DEFAULT '/' NOT NULL,
	"parent_id" uuid,
	"translation_group_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"locale" text DEFAULT 'en' NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"workflow_state" text,
	"attributes" jsonb NOT NULL,
	"pimcore_id" text,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "data_objects" ADD CONSTRAINT "data_objects_parent_id_data_objects_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."data_objects"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "data_classes_pimcore_id_idx" ON "data_classes" USING btree ("pimcore_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "data_objects_class_key_idx" ON "data_objects" USING btree ("class_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "data_objects_translation_group_locale_idx" ON "data_objects" USING btree ("translation_group_id","locale");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "data_objects_pimcore_id_idx" ON "data_objects" USING btree ("pimcore_id");