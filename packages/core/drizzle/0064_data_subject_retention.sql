-- Data subject requests and retention (docs/plans/system/data-subject-plan.md). Expand-only: two nullable columns.
-- NULL = keep forever, which is what every installation does today, so an upgrade deletes nothing.
ALTER TABLE "data_classes" ADD COLUMN IF NOT EXISTS "retention_days" integer;
ALTER TABLE "data_classes" ADD CONSTRAINT "data_classes_retention_days_positive" CHECK ("retention_days" IS NULL OR "retention_days" BETWEEN 1 AND 36500);
ALTER TABLE "security_settings" ADD COLUMN IF NOT EXISTS "mail_log_retention_days" integer;
ALTER TABLE "security_settings" ADD CONSTRAINT "security_settings_mail_log_retention" CHECK ("mail_log_retention_days" IS NULL OR "mail_log_retention_days" BETWEEN 1 AND 36500);
CREATE INDEX IF NOT EXISTS "data_objects_class_created_idx" ON "data_objects" ("class_id", "created_at");
CREATE INDEX IF NOT EXISTS "mail_log_sent_idx" ON "mail_log" ("sent_at");
CREATE INDEX IF NOT EXISTS "form_uploads_submission_idx" ON "form_uploads" ("submission_id");
