-- More events: assets and pages (docs/plans/system/more-events-plan.md). Expand-only.
-- An asset or a page has no data class, so object_events.class_id may be NULL; subject_type says what object_id holds.
ALTER TABLE "object_events" ALTER COLUMN "class_id" DROP NOT NULL;
ALTER TABLE "object_events" ADD COLUMN IF NOT EXISTS "subject_type" text DEFAULT 'object' NOT NULL;
ALTER TABLE "object_events" ADD CONSTRAINT "object_events_subject_type" CHECK ("subject_type" IN ('object', 'asset', 'page'));
