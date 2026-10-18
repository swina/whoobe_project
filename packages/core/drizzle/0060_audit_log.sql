-- Audit log of administrative actions (docs/plans/system/audit-log-plan.md). Expand-only: one new table.
-- Append only, enforced here: an UPDATE or a TRUNCATE is refused, a DELETE only inside the transaction of the retention job
-- (it sets whoobe.audit_purge = 'on' for that transaction). The application has no other delete path.
CREATE TABLE IF NOT EXISTS "audit_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "at" timestamp with time zone DEFAULT now() NOT NULL,
  "actor_type" text NOT NULL,
  "actor_id" text,
  "actor_label" text,
  "ip" text,
  "action" text NOT NULL,
  "target_type" text,
  "target_id" text,
  "target_label" text,
  "before" jsonb,
  "after" jsonb,
  "request_id" text
);
CREATE INDEX IF NOT EXISTS "audit_log_at_idx" ON "audit_log" ("at");
CREATE INDEX IF NOT EXISTS "audit_log_actor_idx" ON "audit_log" ("actor_id", "at");
CREATE INDEX IF NOT EXISTS "audit_log_target_idx" ON "audit_log" ("target_type", "target_id", "at");
CREATE INDEX IF NOT EXISTS "audit_log_action_idx" ON "audit_log" ("action", "at");
CREATE OR REPLACE FUNCTION audit_log_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' AND coalesce(current_setting('whoobe.audit_purge', true), '') = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'audit_log is append only (% refused)', TG_OP USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS audit_log_guard_rows ON "audit_log";
CREATE TRIGGER audit_log_guard_rows BEFORE UPDATE OR DELETE ON "audit_log" FOR EACH ROW EXECUTE FUNCTION audit_log_guard();
DROP TRIGGER IF EXISTS audit_log_guard_truncate ON "audit_log";
CREATE TRIGGER audit_log_guard_truncate BEFORE TRUNCATE ON "audit_log" FOR EACH STATEMENT EXECUTE FUNCTION audit_log_guard();
