-- Website publications started from the dashboard, run by an external runner. Expand-only: a new table.
CREATE TABLE IF NOT EXISTS "publish_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "website_id" uuid NOT NULL,
  "requested_by" uuid,
  "status" text DEFAULT 'queued' NOT NULL,
  "options" jsonb NOT NULL,
  "log" text DEFAULT '' NOT NULL,
  "release_path" text,
  "error" text,
  "cancel_requested" boolean DEFAULT false NOT NULL,
  "runner" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "started_at" timestamp with time zone,
  "heartbeat_at" timestamp with time zone,
  "finished_at" timestamp with time zone
);
CREATE INDEX IF NOT EXISTS "publish_jobs_website_created" ON "publish_jobs" ("website_id", "created_at");
CREATE INDEX IF NOT EXISTS "publish_jobs_status_created" ON "publish_jobs" ("status", "created_at");
-- one queued or running job per website
CREATE UNIQUE INDEX IF NOT EXISTS "publish_jobs_one_active_per_website" ON "publish_jobs" ("website_id") WHERE "status" IN ('queued', 'running');
